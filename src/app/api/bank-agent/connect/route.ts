import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { connectBank } from '@/lib/bank-agent/worker'
import { encrypt } from '@/lib/bank-agent/crypto'
import { processCSV } from '@/lib/csv-processor'
import { categorizeRows } from '@/lib/rules/categorize-batch'
import { loadUserRules } from '@/lib/rules/user-rules'
import type { SyncJobEvent } from '@/types/bank-agent'

const ConnectBodySchema = z.object({
  accountId: z.string().min(1),
  loginUrl: z.string().min(1).transform(url => {
    const trimmed = url.trim()
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`
    }
    return trimmed
  }),
  username: z.string().min(1),
  password: z.string().min(1),
})

interface SseEvent extends SyncJobEvent {
  // Extend if needed
}

function encode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  let body
  try {
    body = await request.json()
    const parsed = ConnectBodySchema.safeParse(body)
    if (!parsed.success) {
      return new Response(`Bad request: ${parsed.error.errors.map(e => e.message).join(', ')}`, { status: 400 })
    }
    body = parsed.data
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { accountId, loginUrl, username, password } = body

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SseEvent) {
        try {
          controller.enqueue(encode(event))
        } catch (e) {
          console.error('[bank-agent/connect] send() failed — stream may be closed:', e)
        }
      }

      const keepAlive = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(': ping\n\n')) } catch {}
      }, 5000)

      // Send immediately so the client knows the stream is alive
      send({ type: 'status', message: 'Received request, authenticating…' })
      console.log('[bank-agent/connect] stream started', { accountId, userId })

      try {
        // Check env vars up front — fail fast with a clear message
        if (!process.env.BROWSERLESS_TOKEN) {
          send({ type: 'error', error: 'BROWSERLESS_TOKEN is not set. Add it to Netlify environment variables.' })
          console.error('[bank-agent/connect] BROWSERLESS_TOKEN missing')
          return
        }
        if (!process.env.ENCRYPTION_SECRET) {
          send({ type: 'error', error: 'ENCRYPTION_SECRET is not set. Add it to Netlify environment variables.' })
          console.error('[bank-agent/connect] ENCRYPTION_SECRET missing')
          return
        }

        send({ type: 'status', message: 'Looking up account…' })
        console.log('[bank-agent/connect] looking up account', accountId)

        // Verify account belongs to user
        const account = await prisma.account.findFirst({
          where: { id: accountId, userId },
          include: { institution: true, bankPlaybook: true }
        })
        if (!account) {
          send({ type: 'error', error: 'Account not found or does not belong to you' })
          console.error('[bank-agent/connect] account not found', { accountId, userId })
          return
        }
        console.log('[bank-agent/connect] account found:', account.name)

        // Check if already connected
        if (account.bankPlaybook) {
          send({ type: 'error', error: 'Account already has a bank connection configured' })
          return
        }

        // Create sync job
        const syncJob = await prisma.syncJob.create({
          data: {
            accountId,
            status: 'CONNECTING',
            triggeredBy: 'connect',
          }
        })
        console.log('[bank-agent/connect] sync job created:', syncJob.id)

        send({ type: 'status', message: 'Starting bank connection…', jobId: syncJob.id })

        // Call worker
        console.log('[bank-agent/connect] calling connectBank worker', { loginUrl, accountId })
        const result = await connectBank(
          { loginUrl, username, password, accountId },
          (event) => {
            console.log('[bank-agent/connect] worker event:', JSON.stringify(event))
            send(event)
          }
        )
        console.log('[bank-agent/connect] worker result:', { success: result.success, error: result.error, csvLen: result.csvText?.length, twoFaType: result.twoFaType, steps: result.discoveredSteps?.length })

        if (!result.success || !result.csvText) {
          await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
              status: 'FAILED',
              error: result.error || 'Unknown error',
              completedAt: new Date()
            }
          })
          send({ type: 'error', error: result.error || 'Failed to connect to bank' })
          return
        }

        send({ type: 'status', message: 'Processing downloaded transactions…' })
        console.log('[bank-agent/connect] processing CSV, length:', result.csvText.length)

        // Encrypt and save credentials
        const encrypted = encrypt(`${username}:${password}`, userId)
        await prisma.encryptedCredential.create({
          data: {
            accountId,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          }
        })

        // Save playbook
        await prisma.bankPlaybook.create({
          data: {
            accountId,
            loginUrl,
            steps: JSON.parse(JSON.stringify(result.discoveredSteps || [])),
            exportPagePath: result.exportPagePath,
            csvDownloadSelector: result.csvDownloadSelector,
            twoFaType: result.twoFaType || 'unknown',
            lastVerifiedAt: new Date(),
            status: 'verified',
          }
        })

        // Process CSV using the existing pipeline logic
        const mapping = {
          dateCol: 'Date', // Default assumptions - banks typically use these
          amountCol: 'Amount',
          descCol: 'Description',
          dateFormat: 'YYYY-MM-DD',
          amountSign: 'normal' as const,
          notesCol: 'Notes',
        }

        // Try to process with default mapping first
        let processed = processCSV(result.csvText, mapping, accountId)

        // If that fails, try common alternatives
        if (processed.errors.length > 0 && processed.rows.length === 0) {
          const lines = result.csvText.split('\n')
          const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, '')) || []

          // Try to find columns by common patterns
          const dateCol = headers.find(h => /date/i.test(h)) || headers[0]
          const amountCol = headers.find(h => /amount|total|debit|credit/i.test(h)) || headers[1]
          const descCol = headers.find(h => /desc|description|memo|narrative/i.test(h)) || headers[2]

          if (dateCol && amountCol && descCol) {
            mapping.dateCol = dateCol
            mapping.amountCol = amountCol
            mapping.descCol = descCol
            processed = processCSV(result.csvText, mapping, accountId)
          }
        }

        console.log('[bank-agent/connect] CSV processed:', { rows: processed.rows.length, errors: processed.errors })

        if (processed.errors.length > 0 && processed.rows.length === 0) {
          await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
              status: 'FAILED',
              error: `CSV processing failed: ${processed.errors.join('; ')}`,
              completedAt: new Date()
            }
          })
          send({ type: 'error', error: `CSV processing failed: ${processed.errors.join('; ')}` })
          return
        }

        // Check for duplicates (same logic as upload/route.ts)
        const hashes = processed.rows.map((r) => r.duplicateHash)
        const existing = await prisma.transaction.findMany({
          where: { duplicateHash: { in: hashes }, account: { userId } },
          select: { duplicateHash: true },
        })
        const existingHashes = new Set(existing.map((e) => e.duplicateHash))

        // Run categorization rules
        const userRules = await loadUserRules(userId)
        const baseRows = processed.rows.map((row) => ({
          description: row.description,
          notes: row.notes ?? null,
          amount: row.amount,
          currency: account.currency,
          date: row.date.toISOString(),
          duplicateHash: row.duplicateHash,
        }))
        const categorized = categorizeRows(baseRows, userRules)

        // Resolve category names to IDs
        const allCategories = await prisma.category.findMany({ where: { userId } })
        const categoryNameMap = new Map<string, string>(
          allCategories.map((c) => [c.name.toLowerCase(), c.id])
        )

        const newRows = categorized
          .filter((row) => !existingHashes.has(row.duplicateHash))
          .map((row) => {
            const resolvedCategoryId =
              row.suggestedCategoryId ??
              (row.suggestedCategory ? (categoryNameMap.get(row.suggestedCategory.toLowerCase()) ?? null) : null)
            const resolvedPayeeId = row.suggestedPayeeId ?? null
            const originalRow = processed.rows.find((r) => r.duplicateHash === row.duplicateHash)!

            return {
              date: row.date,
              amount: row.amount,
              description: row.description,
              notes: originalRow.notes ?? null,
              category: row.suggestedCategory ?? null,
              categoryId: resolvedCategoryId,
              payeeId: resolvedPayeeId,
              duplicateHash: row.duplicateHash,
              rawData: originalRow.rawData,
            }
          })

        if (newRows.length === 0) {
          await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
              status: 'COMPLETE',
              imported: 0,
              skipped: processed.rows.length,
              completedAt: new Date()
            }
          })
          send({
            type: 'complete',
            message: `Connected successfully! All ${processed.rows.length} transactions were duplicates.`,
            imported: 0,
            skipped: processed.rows.length
          })
          return
        }

        // Import transactions (same logic as transactions/import/route.ts)
        const batch = await prisma.$transaction(async (tx) => {
          const importBatch = await tx.importBatch.create({
            data: {
              accountId,
              filename: 'bank-sync.csv',
              rowCount: newRows.length,
              skippedCount: processed.rows.length - newRows.length,
            },
          })

          await tx.transaction.createMany({
            data: newRows.map((row) => ({
              accountId,
              importBatchId: importBatch.id,
              date: new Date(row.date),
              amount: row.amount,
              description: row.description,
              notes: row.notes,
              category: row.category,
              categoryId: row.categoryId,
              payeeId: row.payeeId,
              duplicateHash: row.duplicateHash,
              rawData: row.rawData,
              tags: [],
            })),
            skipDuplicates: true,
          })

          await tx.account.update({
            where: { id: accountId },
            data: { lastImportAt: new Date() },
          })

          return importBatch
        })

        // Update sync job
        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: {
            status: 'COMPLETE',
            imported: newRows.length,
            skipped: processed.rows.length - newRows.length,
            batchId: batch.id,
            completedAt: new Date()
          }
        })

        send({
          type: 'complete',
          message: `Bank connected successfully! Imported ${newRows.length} transactions, skipped ${processed.rows.length - newRows.length} duplicates.`,
          imported: newRows.length,
          skipped: processed.rows.length - newRows.length
        })

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error('[bank-agent/connect] unhandled error:', err)
        send({ type: 'error', error: errorMsg })
      } finally {
        clearInterval(keepAlive)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
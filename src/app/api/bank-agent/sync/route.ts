import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { syncBank } from '@/lib/bank-agent/worker'
import { decrypt } from '@/lib/bank-agent/crypto'
import { processCSV } from '@/lib/csv-processor'
import { categorizeRows } from '@/lib/rules/categorize-batch'
import { loadUserRules } from '@/lib/rules/user-rules'
import type { SyncJobEvent, PlaybookStep } from '@/types/bank-agent'

const SyncBodySchema = z.object({
  accountId: z.string().min(1),
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
    const parsed = SyncBodySchema.safeParse(body)
    if (!parsed.success) {
      return new Response(`Bad request: ${parsed.error.errors.map(e => e.message).join(', ')}`, { status: 400 })
    }
    body = parsed.data
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { accountId } = body

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SseEvent) {
        controller.enqueue(encode(event))
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'))
      }, 5000)

      try {
        // Load account with playbook and credentials
        const account = await prisma.account.findFirst({
          where: { id: accountId, userId },
          include: {
            institution: true,
            bankPlaybook: true,
            encryptedCredential: true,
          }
        })

        if (!account) {
          send({ type: 'error', error: 'Account not found or does not belong to you' })
          return
        }

        if (!account.bankPlaybook) {
          send({ type: 'error', error: 'No bank connection configured for this account' })
          return
        }

        if (!account.encryptedCredential) {
          send({ type: 'error', error: 'No stored credentials found for this account' })
          return
        }

        // Decrypt credentials
        const decryptedCreds = decrypt(
          account.encryptedCredential.ciphertext,
          account.encryptedCredential.iv,
          account.encryptedCredential.authTag,
          userId
        )
        const [username, password] = decryptedCreds.split(':')

        if (!username || !password) {
          send({ type: 'error', error: 'Invalid stored credentials' })
          return
        }

        // Create sync job
        const syncJob = await prisma.syncJob.create({
          data: {
            accountId,
            status: 'CONNECTING',
            triggeredBy: 'manual',
          }
        })

        send({ type: 'status', message: 'Starting sync...', jobId: syncJob.id })

        // Update sync job status
        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: { status: 'DOWNLOADING' }
        })

        // Call worker with playbook
        const result = await syncBank(
          {
            loginUrl: account.bankPlaybook.loginUrl,
            username,
            password,
            steps: JSON.parse(JSON.stringify(account.bankPlaybook.steps)) as PlaybookStep[],
            csvDownloadSelector: account.bankPlaybook.csvDownloadSelector ?? undefined,
            exportPagePath: account.bankPlaybook.exportPagePath ?? undefined,
          },
          (event) => send(event)
        )

        if (!result.success || !result.csvText) {
          // Mark playbook as potentially broken
          await prisma.bankPlaybook.update({
            where: { accountId },
            data: { status: 'broken' }
          })

          await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
              status: 'FAILED',
              error: result.error || 'Unknown error',
              completedAt: new Date()
            }
          })
          send({ type: 'error', error: result.error || 'Failed to sync with bank' })
          return
        }

        // Update sync job status
        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: { status: 'IMPORTING' }
        })

        send({ type: 'status', message: 'Processing downloaded transactions...' })

        // Mark playbook as verified and update last verified time
        await prisma.bankPlaybook.update({
          where: { accountId },
          data: {
            status: 'verified',
            lastVerifiedAt: new Date()
          }
        })

        // Process CSV using the same pipeline as connect
        const mapping = {
          dateCol: 'Date', // Default assumptions
          amountCol: 'Amount',
          descCol: 'Description',
          dateFormat: 'YYYY-MM-DD',
          amountSign: 'normal' as const,
          notesCol: 'Notes',
        }

        let processed = processCSV(result.csvText, mapping, accountId)

        // If that fails, try common alternatives (same logic as connect)
        if (processed.errors.length > 0 && processed.rows.length === 0) {
          const lines = result.csvText.split('\n')
          const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, '')) || []

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

        // Check for duplicates
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
            message: `Sync completed! All ${processed.rows.length} transactions were duplicates.`,
            imported: 0,
            skipped: processed.rows.length
          })
          return
        }

        // Import transactions
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
          message: `Sync completed! Imported ${newRows.length} new transactions, skipped ${processed.rows.length - newRows.length} duplicates.`,
          imported: newRows.length,
          skipped: processed.rows.length - newRows.length
        })

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error('[bank-agent/sync]', err)
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
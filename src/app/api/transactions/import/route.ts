import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { enqueueJob } from '@/lib/background-jobs'
import { headerSignature } from '@/lib/import-signature'
import { logger } from '@/lib/log'

const nullableString = z.union([z.string(), z.null()]).transform((v) => v ?? '')
const optionalNullableString = z.union([z.string(), z.null()]).transform((v) => (v && v.trim()) ? v.trim() : null).optional()

const ImportRowSchema = z.object({
  date: z.string(),
  amount: z.number(),
  description: nullableString,
  notes: optionalNullableString,
  category: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  duplicateHash: z.string(),
  rawData: z.record(nullableString),
})

const ImportFileSchema = z.object({
  filename: z.string().min(1),
  rows: z.array(ImportRowSchema),
})

const ProfileSchema = z.object({
  headers: z.array(z.string()),
  mapping: z.record(z.string()),
  source: z.enum(['csv', 'pdf']).default('csv'),
})

const ImportBodySchema = z.object({
  accountId: z.string().min(1),
  files: z.array(ImportFileSchema).min(1).optional(),
  filename: z.string().min(1).optional(),
  rows: z.array(ImportRowSchema).optional(),
  profile: ProfileSchema.optional(),
}).refine(
  (d) => d.files || (d.filename && d.rows),
  { message: 'Either files or filename+rows is required' }
)

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = ImportBodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { accountId, profile } = parsed.data
    const files = parsed.data.files
      ?? [{ filename: parsed.data.filename!, rows: parsed.data.rows! }]

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } })
    if (!account) return notFound('Account not found or does not belong to you')

    // Gather all hashes across files to check for existing duplicates
    const allHashes = files.flatMap((f) => f.rows.map((r) => r.duplicateHash))
    const existing = await prisma.transaction.findMany({
      where: { duplicateHash: { in: allHashes }, account: { userId } },
      select: { duplicateHash: true },
    })
    const existingHashes = new Set(existing.map((e) => e.duplicateHash))

    let totalImported = 0
    let totalSkipped = 0
    const batchIds: string[] = []
    const allImportedIds: string[] = []

    for (const file of files) {
      const newRows = file.rows.filter((r) => !existingHashes.has(r.duplicateHash))

      if (newRows.length === 0) {
        totalSkipped += file.rows.length
        continue
      }

      const importBatch = await prisma.importBatch.create({
        data: {
          accountId,
          filename: file.filename,
          rowCount: newRows.length,
          skippedCount: file.rows.length - newRows.length,
        },
      })

      await prisma.transaction.createMany({
        data: newRows.map((row) => ({
          accountId,
          importBatchId: importBatch.id,
          date: new Date(row.date),
          amount: row.amount,
          description: row.description,
          notes: row.notes ?? null,
          category: row.category ?? null,
          categoryId: row.categoryId ?? null,
          payeeId: row.payeeId ?? null,
          duplicateHash: row.duplicateHash,
          rawData: row.rawData,
          tags: [],
        })),
        skipDuplicates: true,
      })

      // Collect imported IDs for background jobs
      const importedTxs = await prisma.transaction.findMany({
        where: { importBatchId: importBatch.id },
        select: { id: true },
      })
      allImportedIds.push(...importedTxs.map((t) => t.id))

      totalImported += newRows.length
      totalSkipped += file.rows.length - newRows.length
      batchIds.push(importBatch.id)
    }

    if (totalImported > 0) {
      await prisma.account.update({
        where: { id: accountId },
        data: { lastImportAt: new Date() },
      })
    }

    // Best-effort profile upsert — never fail the import
    if (profile) {
      try {
        const signature = headerSignature(profile.headers)
        await prisma.importProfile.upsert({
          where: { userId_signature: { userId, signature } },
          create: {
            userId,
            signature,
            headers: profile.headers,
            mapping: profile.mapping,
            accountId,
            source: profile.source,
            useCount: 1,
          },
          update: {
            headers: profile.headers,
            mapping: profile.mapping,
            accountId,
            source: profile.source,
            useCount: { increment: 1 },
            lastUsedAt: new Date(),
          },
        })
      } catch (err) {
        logger.error('import', 'profile upsert failed (non-critical)', {
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Enqueue background jobs once per request
    if (allImportedIds.length > 0) {
      await Promise.allSettled([
        enqueueJob('invoice-matching', userId, { userId, importedIds: allImportedIds }),
        enqueueJob('receipt-matching', userId, { userId, importedIds: allImportedIds }),
      ])

      enqueueJob('rules-agent', userId, { userId }).catch((err) => {
        logger.error('import', 'failed to enqueue rules agent', { message: err instanceof Error ? err.message : String(err) })
      })
    }

    return ok({
      imported: totalImported,
      skipped: totalSkipped,
      batchIds,
    })
  } catch {
    return serverError('Failed to import transactions')
  }
}

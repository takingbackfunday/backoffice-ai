import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { enqueueJob } from '@/lib/background-jobs'
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

const ImportBodySchema = z.object({
  accountId: z.string().min(1),
  filename: z.string().min(1),
  rows: z.array(ImportRowSchema),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = ImportBodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { accountId, filename, rows } = parsed.data

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } })
    if (!account) return notFound('Account not found or does not belong to you')

    // Filter out duplicates (scoped to this user's accounts)
    const hashes = rows.map((r) => r.duplicateHash)
    const existing = await prisma.transaction.findMany({
      where: { duplicateHash: { in: hashes }, account: { userId } },
      select: { duplicateHash: true },
    })
    const existingHashes = new Set(existing.map((e) => e.duplicateHash))
    const newRows = rows.filter((r) => !existingHashes.has(r.duplicateHash))

    if (newRows.length === 0) {
      return ok({ imported: 0, skipped: rows.length, batchId: null })
    }

    // Use sequential awaits rather than an interactive transaction — createMany on
    // large CSVs can exceed the 5 s interactive-transaction timeout on Neon/PgBouncer.
    // These three writes don't need to be atomic: importBatch and lastImportAt are
    // non-critical metadata; skipDuplicates on createMany makes it safe to re-run.
    const importBatch = await prisma.importBatch.create({
      data: {
        accountId,
        filename,
        rowCount: newRows.length,
        skippedCount: rows.length - newRows.length,
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

    await prisma.account.update({
      where: { id: accountId },
      data: { lastImportAt: new Date() },
    })

    const batch = importBatch

    // Fetch imported transaction IDs for background jobs
    const importedTxs = await prisma.transaction.findMany({
      where: { importBatchId: batch.id },
      select: { id: true },
    })
    const importedIds = importedTxs.map(t => t.id)

    // Enqueue background jobs for durability — survives machine suspension.
    // Invoice/receipt matching are enqueued with immediate drain for fast feedback.
    // Rules agent runs in the background (fire-and-forget).
    await Promise.allSettled([
      enqueueJob('invoice-matching', userId, { userId, importedIds }),
      enqueueJob('receipt-matching', userId, { userId, importedIds }),
    ])

    // Rules agent: enqueue for durability, but also kick immediate background execution.
    // The drain is best-effort — if the machine suspends, the cron sweep picks it up.
    enqueueJob('rules-agent', userId, { userId }).catch((err) => {
      logger.error('import', 'failed to enqueue rules agent', { message: err instanceof Error ? err.message : String(err) })
    })

    return ok({
      imported: newRows.length,
      skipped: rows.length - newRows.length,
      batchId: batch.id,
    })
  } catch {
    return serverError('Failed to import transactions')
  }
}

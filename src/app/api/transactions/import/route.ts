import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { enqueueJob } from '@/lib/background-jobs'
import { headerSignature } from '@/lib/import-signature'
import { logger } from '@/lib/log'
import { verifyRowHashes, scrubForeignRefs, ImportHashMismatchError } from '@/lib/import-rows'

const nullableString = z.union([z.string(), z.null()]).transform((v) => v ?? '')
const optionalNullableString = z.union([z.string(), z.null()]).transform((v) => (v && v.trim()) ? v.trim() : null).optional()
const MAX_ABS_AMOUNT = 10_000_000_000 // Decimal(12,2) limit

const ImportRowSchema = z.object({
  date: z.string().datetime({ offset: true }),
  amount: z.number().finite().refine((n) => Math.abs(n) < MAX_ABS_AMOUNT, { message: 'Amount out of range' }),
  description: nullableString,
  notes: optionalNullableString,
  category: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  duplicateHash: z.string(),
  occurrence: z.number().int().min(0).optional(),
  rawData: z.record(nullableString),
})

const ImportFileSchema = z.object({
  filename: z.string().min(1),
  rows: z.array(ImportRowSchema),
})

const ProfileSchema = z.object({
  headers: z.array(z.string()),
  mapping: z.record(z.string()),
  source: z.enum(['csv', 'pdf', 'excel']).default('csv'),
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

    // Server is the authority: hashes must match the row data
    try {
      for (const f of files) verifyRowHashes(accountId, f.rows)
    } catch (err) {
      if (err instanceof ImportHashMismatchError) return badRequest(err.message)
      throw err
    }

    // Only allow links to this user's own categories/payees
    const refCategoryIds = [...new Set(files.flatMap((f) => f.rows.map((r) => r.categoryId).filter((v): v is string => !!v)))]
    const refPayeeIds = [...new Set(files.flatMap((f) => f.rows.map((r) => r.payeeId).filter((v): v is string => !!v)))]
    const [ownedCats, ownedPayees] = await Promise.all([
      refCategoryIds.length ? prisma.category.findMany({ where: { userId, id: { in: refCategoryIds } }, select: { id: true } }) : [],
      refPayeeIds.length ? prisma.payee.findMany({ where: { userId, id: { in: refPayeeIds } }, select: { id: true } }) : [],
    ])
    const owned = { categoryIds: new Set(ownedCats.map((c) => c.id)), payeeIds: new Set(ownedPayees.map((p) => p.id)) }
    let scrubbedTotal = 0
    const cleanFiles = files.map((f) => {
      const { rows, scrubbed } = scrubForeignRefs(f.rows, owned)
      scrubbedTotal += scrubbed
      return { ...f, rows }
    })
    if (scrubbedTotal > 0) logger.warn('import', 'dropped foreign category/payee refs', { userId, scrubbedTotal })

    // Gather all hashes across files to check for existing duplicates
    const allHashes = cleanFiles.flatMap((f) => f.rows.map((r) => r.duplicateHash))
    const existing = await prisma.transaction.findMany({
      where: { duplicateHash: { in: allHashes }, account: { userId } },
      select: { duplicateHash: true },
    })
    const existingHashes = new Set(existing.map((e) => e.duplicateHash))

    const { totalImported, totalSkipped, batchIds, allImportedIds } = await prisma.$transaction(
      async (tx) => {
        let totalImported = 0
        let totalSkipped = 0
        const batchIds: string[] = []
        const allImportedIds: string[] = []

        for (const file of cleanFiles) {
          const newRows = file.rows.filter((r) => !existingHashes.has(r.duplicateHash))
          if (newRows.length === 0) {
            totalSkipped += file.rows.length
            continue
          }

          const importBatch = await tx.importBatch.create({
            data: { accountId, filename: file.filename, rowCount: 0, skippedCount: 0 },
          })

          const { count } = await tx.transaction.createMany({
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

          if (count === 0) {
            await tx.importBatch.delete({ where: { id: importBatch.id } })
            totalSkipped += file.rows.length
            continue
          }

          await tx.importBatch.update({
            where: { id: importBatch.id },
            data: { rowCount: count, skippedCount: file.rows.length - count },
          })

          const importedTxs = await tx.transaction.findMany({
            where: { importBatchId: importBatch.id },
            select: { id: true },
          })
          allImportedIds.push(...importedTxs.map((t) => t.id))
          totalImported += count
          totalSkipped += file.rows.length - count
          batchIds.push(importBatch.id)
        }

        if (totalImported > 0) {
          await tx.account.update({ where: { id: accountId }, data: { lastImportAt: new Date() } })
        }

        return { totalImported, totalSkipped, batchIds, allImportedIds }
      },
      { maxWait: 10_000, timeout: 60_000 }
    )

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
  } catch (err) {
    logger.error('import', 'POST error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to import transactions')
  }
}

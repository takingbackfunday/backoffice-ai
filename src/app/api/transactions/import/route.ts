import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { matchTenantPayments } from '@/lib/rent-matching'

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

    const batch = await prisma.$transaction(async (tx) => {
      const importBatch = await tx.importBatch.create({
        data: {
          accountId,
          filename,
          rowCount: newRows.length,
          skippedCount: rows.length - newRows.length,
        },
      })

      await tx.transaction.createMany({
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

      await tx.account.update({
        where: { id: accountId },
        data: { lastImportAt: new Date() },
      })

      return importBatch
    })

    // Fire-and-forget rent matching — never block the import response
    prisma.transaction.findMany({
      where: { importBatchId: batch.id },
      select: { id: true },
    }).then(txs => {
      const ids = txs.map(t => t.id)
      return matchTenantPayments(userId, ids)
    }).catch(() => { /* silent — matching failure never blocks import */ })

    return ok({
      imported: newRows.length,
      skipped: rows.length - newRows.length,
      batchId: batch.id,
    })
  } catch {
    return serverError('Failed to import transactions')
  }
}

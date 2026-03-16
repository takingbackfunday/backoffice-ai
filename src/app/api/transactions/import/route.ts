import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const nullableString = z.union([z.string(), z.null()]).transform((v) => v ?? '')
const optionalMerchant = z.union([z.string(), z.null()]).transform((v) => (v && v.trim()) ? v.trim() : null).optional()

const ImportRowSchema = z.object({
  date: z.string(),
  amount: z.number(),
  description: nullableString,
  merchantName: optionalMerchant,
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

    // Filter out duplicates
    const hashes = rows.map((r) => r.duplicateHash)
    const existing = await prisma.transaction.findMany({
      where: { duplicateHash: { in: hashes } },
      select: { duplicateHash: true },
    })
    const existingHashes = new Set(existing.map((e) => e.duplicateHash))
    const newRows = rows.filter((r) => !existingHashes.has(r.duplicateHash))

    if (newRows.length === 0) {
      return ok({ imported: 0, skipped: rows.length, batchId: null })
    }

    // Upsert any payees that don't have an ID yet (new merchant names not seen before)
    const payeeByName = new Map<string, string>()  // merchantName → payeeId
    const payeeByHash = new Map<string, string>()  // duplicateHash → payeeId
    const rowsNeedingPayee = newRows.filter((r) => !r.payeeId && r.merchantName && r.merchantName.trim())
    for (const row of rowsNeedingPayee) {
      const name = row.merchantName!.trim()
      if (!payeeByName.has(name)) {
        const payee = await prisma.payee.upsert({
          where: { userId_name: { userId, name } },
          update: {},
          create: { userId, name },
        })
        payeeByName.set(name, payee.id)
      }
      payeeByHash.set(row.duplicateHash, payeeByName.get(name)!)
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
          merchantName: row.merchantName,
          category: row.category ?? null,
          categoryId: row.categoryId ?? null,
          payeeId: row.payeeId ?? payeeByHash.get(row.duplicateHash) ?? null,
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

    return ok({
      imported: newRows.length,
      skipped: rows.length - newRows.length,
      batchId: batch.id,
    })
  } catch {
    return serverError('Failed to import transactions')
  }
}

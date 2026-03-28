import { prisma } from '@/lib/prisma'
import { buildDuplicateHash } from '@/lib/dedup'
import { loadUserRules } from '@/lib/rules/user-rules'
import { categorizeRows, type CategorizableRow } from '@/lib/rules/categorize-batch'
import { mapProviderCategory } from './category-map'
import type { NormalizedTransaction } from '@/types/bank-providers'
import type { BankProvider } from '@/generated/prisma'

export interface SyncResult {
  imported: number
  skipped: number
  batchId: string | null
  errors: string[]
}

export async function importNormalizedTransactions(params: {
  userId: string
  accountId: string
  provider: BankProvider
  transactions: NormalizedTransaction[]
  syncJobId?: string
}): Promise<SyncResult> {
  const { userId, accountId, provider, transactions, syncJobId } = params
  const errors: string[] = []

  if (transactions.length === 0) {
    return { imported: 0, skipped: 0, batchId: null, errors: [] }
  }

  // 1. Normalize to dedup-compatible rows
  const rows = transactions
    .filter(t => t.status === 'posted')
    .map(t => ({
      date: t.date,
      amount: t.amount,
      description: t.description,
      notes: null as string | null,
      duplicateHash: buildDuplicateHash({
        accountId,
        date: t.date,
        amount: t.amount,
        description: t.description,
      }),
      rawData: t.rawData,
      providerCategory: t.category,
      providerPayee: t.counterpartyName,
      externalId: t.externalId,
    }))

  // 2. Dedup against existing transactions
  const hashes = rows.map(r => r.duplicateHash)
  const existing = await prisma.transaction.findMany({
    where: { duplicateHash: { in: hashes }, account: { userId } },
    select: { duplicateHash: true },
  })
  const existingHashes = new Set(existing.map(e => e.duplicateHash))

  // 3. Run categorization rules
  const userRules = await loadUserRules(userId)
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { currency: true },
  })

  const categorizableRows: CategorizableRow[] = rows.map(row => ({
    description: row.description,
    payeeName: row.providerPayee ?? null,
    amount: row.amount,
    currency: account?.currency ?? 'USD',
    date: new Date(row.date).toISOString(),
    duplicateHash: row.duplicateHash,
  }))

  const categorized = categorizeRows(categorizableRows, userRules)

  // 4. For rows that the rules engine didn't categorize, try provider category
  const allCategories = await prisma.category.findMany({ where: { userId } })
  const categoryNameMap = new Map<string, string>(
    allCategories.map(c => [c.name.toLowerCase(), c.id])
  )

  const newRows = categorized
    .filter(row => !existingHashes.has(row.duplicateHash))
    .map(row => {
      const original = rows.find(r => r.duplicateHash === row.duplicateHash)!

      let categoryName = row.suggestedCategory
      let categoryId = row.suggestedCategoryId

      if (!categoryId && !categoryName && original.providerCategory) {
        const mapped = mapProviderCategory(
          provider as 'TELLER' | 'PLAID',
          original.providerCategory
        )
        if (mapped) {
          categoryName = mapped
          categoryId = categoryNameMap.get(mapped.toLowerCase()) ?? null
        }
      }

      if (!categoryId && categoryName) {
        categoryId = categoryNameMap.get(categoryName.toLowerCase()) ?? null
      }

      return {
        date: row.date,
        amount: row.amount,
        description: row.description,
        notes: null as string | null,
        category: categoryName,
        categoryId,
        payeeId: row.suggestedPayeeId ?? null,
        duplicateHash: row.duplicateHash,
        rawData: original.rawData,
      }
    })

  if (newRows.length === 0) {
    return { imported: 0, skipped: rows.length, batchId: null, errors }
  }

  // 5. Insert via transaction
  const batch = await prisma.$transaction(async (tx) => {
    const importBatch = await tx.importBatch.create({
      data: {
        accountId,
        filename: `${provider.toLowerCase()}-sync`,
        rowCount: newRows.length,
        skippedCount: rows.length - newRows.length,
      },
    })

    await tx.transaction.createMany({
      data: newRows.map(row => ({
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
        rawData: row.rawData as import('@/generated/prisma').Prisma.InputJsonValue,
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

  // 6. Update sync job if provided
  if (syncJobId) {
    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: 'COMPLETE',
        imported: newRows.length,
        skipped: rows.length - newRows.length,
        batchId: batch.id,
        completedAt: new Date(),
      },
    })
  }

  return {
    imported: newRows.length,
    skipped: rows.length - newRows.length,
    batchId: batch.id,
    errors,
  }
}

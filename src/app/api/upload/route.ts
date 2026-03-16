import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { processCSV } from '@/lib/csv-processor'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import type { CsvMapping } from '@/lib/csv-processor'
import { categorizeRows } from '@/lib/rules/categorize-batch'
import { loadUserRules } from '@/lib/rules/user-rules'

const UploadBodySchema = z.object({
  accountId: z.string().min(1),
  csvText: z.string().min(1),
  mapping: z.object({
    dateCol: z.string(),
    amountCol: z.string(),
    descCol: z.string(),
    dateFormat: z.string(),
    amountSign: z.enum(['normal', 'inverted']),
    notesCol: z.string().optional(),
  }),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = UploadBodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { accountId, csvText, mapping } = parsed.data

    // Verify account belongs to user
    const account = await prisma.account.findFirst({ where: { id: accountId, userId } })
    if (!account) return notFound('Account not found or does not belong to you')

    const result = processCSV(csvText, mapping as CsvMapping, accountId)

    // Check which hashes already exist (duplicates — scoped to this user's accounts)
    const hashes = result.rows.map((r) => r.duplicateHash)
    const existing = await prisma.transaction.findMany({
      where: { duplicateHash: { in: hashes }, account: { userId } },
      select: { duplicateHash: true },
    })
    const existingHashes = new Set(existing.map((e) => e.duplicateHash))

    // Run categorization rules (user rules only — system rules removed)
    const userRules = await loadUserRules(userId)
    const baseRows = result.rows.map((row) => ({
      description: row.description,
      notes: row.notes ?? null,
      amount: row.amount,
      currency: account.currency,
      date: row.date.toISOString(),
      duplicateHash: row.duplicateHash,
    }))
    const categorized = categorizeRows(baseRows, userRules)

    // Resolve category string names → category IDs (for rows where categoryId is not set by a user rule).
    // Only look up existing categories — do NOT seed here (seeding is triggered lazily by GET /api/category-groups).
    const allCategories = await prisma.category.findMany({ where: { userId } })
    const categoryNameMap = new Map<string, string>(
      allCategories.map((c) => [c.name.toLowerCase(), c.id])
    )

    const preview = categorized.map((row) => {
      const resolvedCategoryId =
        row.suggestedCategoryId ??
        (row.suggestedCategory ? (categoryNameMap.get(row.suggestedCategory.toLowerCase()) ?? null) : null)
      const resolvedPayeeId = row.suggestedPayeeId ?? null
      const originalRow = result.rows.find((r) => r.duplicateHash === row.duplicateHash)

      return {
        date: row.date,
        amount: row.amount,
        description: row.description,
        notes: originalRow?.notes ?? null,
        duplicateHash: row.duplicateHash,
        isDuplicate: existingHashes.has(row.duplicateHash),
        rawData: originalRow?.rawData ?? {},
        suggestedCategory: row.suggestedCategory,
        suggestedCategoryId: resolvedCategoryId,
        payeeId: resolvedPayeeId,
        suggestionConfidence: row.suggestionConfidence,
        matchedRuleId: row.matchedRuleId,
      }
    })

    return ok(preview, {
      totalRows: result.totalParsed,
      parsedRows: result.rows.length,
      duplicateCount: preview.filter((r) => r.isDuplicate).length,
      skippedCount: result.skippedCount,
      errors: result.errors,
    })
  } catch (err) {
    console.error('[/api/upload]', err)
    return serverError('Failed to process CSV file')
  }
}

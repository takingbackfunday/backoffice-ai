import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { processCSV } from '@/lib/csv-processor'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import type { CsvMapping } from '@/lib/csv-processor'
import { categorizeRows } from '@/lib/rules/categorize-batch'
import { loadUserRules } from '@/lib/rules/user-rules'
import { logger } from '@/lib/log'

const MappingSchema = z.object({
  dateCol: z.string(),
  amountCol: z.string(),
  descCol: z.string(),
  dateFormat: z.string().optional(),
  amountSign: z.enum(['normal', 'inverted']),
  notesCol: z.string().optional(),
})

const UploadFileSchema = z.object({
  filename: z.string().min(1),
  csvText: z.string().min(1),
})

const UploadBodySchema = z.object({
  accountId: z.string().min(1),
  mapping: MappingSchema,
  files: z.array(UploadFileSchema).min(1).optional(),
  csvText: z.string().min(1).optional(),
}).refine(
  (d) => d.files || d.csvText,
  { message: 'Either files or csvText is required' }
)

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = UploadBodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { accountId, mapping } = parsed.data
    const files = parsed.data.files
      ?? [{ filename: 'upload.csv', csvText: parsed.data.csvText! }]

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } })
    if (!account) return notFound('Account not found or does not belong to you')

    // Process each file and accumulate rows
    const perFile: { filename: string; rowCount: number }[] = []
    const allRows: ({ filename: string } & ReturnType<typeof processCSV>['rows'][number])[] = []
    const allErrors: string[] = []
    let totalParsed = 0
    let totalSkipped = 0

    for (const file of files) {
      const result = processCSV(file.csvText, mapping as CsvMapping, accountId)
      perFile.push({ filename: file.filename, rowCount: result.totalParsed })
      allRows.push(...result.rows.map((r) => ({ ...r, filename: file.filename })))
      allErrors.push(...result.errors)
      totalParsed += result.totalParsed
      totalSkipped += result.skippedCount
    }

    // Dedup against existing transactions (scoped to this user's accounts)
    const hashes = allRows.map((r) => r.duplicateHash)
    const existing = await prisma.transaction.findMany({
      where: { duplicateHash: { in: hashes }, account: { userId } },
      select: { duplicateHash: true },
    })
    const existingHashes = new Set(existing.map((e) => e.duplicateHash))

    // Run categorization rules
    const userRules = await loadUserRules(userId)
    const baseRows = allRows.map((row) => ({
      description: row.description,
      notes: row.notes ?? null,
      amount: row.amount,
      currency: account.currency,
      date: row.date.toISOString(),
      duplicateHash: row.duplicateHash,
    }))
    const categorized = categorizeRows(baseRows, userRules)

    // Resolve category names → IDs
    const allCategories = await prisma.category.findMany({ where: { userId } })
    const categoryNameMap = new Map<string, string>(
      allCategories.map((c) => [c.name.toLowerCase(), c.id])
    )

    const preview = categorized.map((row) => {
      const resolvedCategoryId =
        row.suggestedCategoryId ??
        (row.suggestedCategory ? (categoryNameMap.get(row.suggestedCategory.toLowerCase()) ?? null) : null)
      const resolvedPayeeId = row.suggestedPayeeId ?? null
      const originalRow = allRows.find((r) => r.duplicateHash === row.duplicateHash)

      return {
        date: row.date,
        amount: row.amount,
        description: row.description,
        notes: originalRow?.notes ?? null,
        duplicateHash: row.duplicateHash,
        isDuplicate: existingHashes.has(row.duplicateHash),
        rawData: originalRow?.rawData ?? {},
        filename: originalRow?.filename,
        suggestedCategory: row.suggestedCategory,
        suggestedCategoryId: resolvedCategoryId,
        payeeId: resolvedPayeeId,
        suggestionConfidence: row.suggestionConfidence,
        matchedRuleId: row.matchedRuleId,
      }
    })

    return ok(preview, {
      totalRows: totalParsed,
      parsedRows: allRows.length,
      duplicateCount: preview.filter((r) => r.isDuplicate).length,
      skippedCount: totalSkipped,
      errors: allErrors,
      perFile,
    })
  } catch (err) {
    logger.error('upload', 'POST error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to process CSV file')
  }
}

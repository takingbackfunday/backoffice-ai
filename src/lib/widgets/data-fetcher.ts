import { prisma } from '@/lib/prisma'
import type { WidgetConfig } from '@/types/widgets'
import { resolveDateRange } from './date-utils'
import { format } from 'date-fns'
import { convertAmounts } from '@/lib/fx'

export interface RawDataRow {
  date: Date
  amount: number
  category: string
  categoryGroup: string
  payee: string
  account: string
}

export async function fetchWidgetData(
  userId: string,
  config: WidgetConfig,
  currency = 'USD',
): Promise<RawDataRow[]> {
  const { start, end } = resolveDateRange(config.dateRange)

  // Build category filter from DataFilter[]
  const categoryFilter = config.filters.find((f) => f.field === 'category')
  let categoryWhere: Record<string, unknown> | undefined
  if (categoryFilter && categoryFilter.values.length > 0) {
    const includesUncategorized = categoryFilter.values.includes('Uncategorized')
    const namedValues = categoryFilter.values.filter((v) => v !== 'Uncategorized')

    if (categoryFilter.operator === 'include') {
      // Include named categories + optionally null (uncategorized)
      if (includesUncategorized && namedValues.length > 0) {
        categoryWhere = { OR: [{ categoryRef: { name: { in: namedValues } } }, { categoryId: null }] }
      } else if (includesUncategorized) {
        categoryWhere = { categoryId: null }
      } else {
        // Named only — exclude nulls
        categoryWhere = { categoryRef: { name: { in: namedValues } } }
      }
    } else {
      // Exclude: named categories excluded, and optionally exclude nulls too
      if (includesUncategorized) {
        categoryWhere = { categoryRef: { name: { notIn: namedValues } }, NOT: { categoryId: null } }
      } else {
        // Exclude named but keep nulls (uncategorized stays visible)
        categoryWhere = { OR: [{ categoryRef: { name: { notIn: namedValues } } }, { categoryId: null }] }
      }
    }
  }

  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      date: { gte: start, lte: end },
      // Only expenses (negative amounts) for spending charts
      amount: { lt: 0 },
      // Exclude non-deductible groups (account transfers, owner draws, etc.)
      // unless the user has explicitly filtered to specific categories
      ...(!categoryWhere ? { NOT: { categoryRef: { group: { taxType: 'non_deductible' } } } } : {}),
      ...categoryWhere,
    },
    select: {
      date: true,
      amount: true,
      categoryRef: { select: { name: true, group: { select: { name: true } } } },
      payee: { select: { name: true } },
      account: { select: { name: true, currency: true } },
    },
    orderBy: { date: 'asc' },
  })

  // Convert all amounts to the target currency in one batch
  const convertInput = rows.map((r) => ({
    amount: Math.abs(Number(r.amount)),
    currency: r.account?.currency ?? 'USD',
    month: format(r.date, 'yyyy-MM'),
  }))
  const converted = await convertAmounts(convertInput, currency)

  return rows.map((r, i) => ({
    date: r.date,
    amount: converted[i],
    category: r.categoryRef?.name ?? 'Uncategorized',
    categoryGroup: r.categoryRef?.group?.name ?? 'No Group',
    payee: r.payee?.name ?? 'Unknown',
    account: r.account?.name ?? 'Unknown',
  }))
}

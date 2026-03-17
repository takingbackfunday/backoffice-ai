import { prisma } from '@/lib/prisma'
import type { WidgetConfig } from '@/types/widgets'
import { resolveDateRange } from './date-utils'

export interface RawDataRow {
  date: Date
  amount: number
  category: string
  categoryGroup: string
  payee: string
  account: string
}

export async function fetchWidgetData(userId: string, config: WidgetConfig): Promise<RawDataRow[]> {
  const { start, end } = resolveDateRange(config.dateRange)

  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      date: { gte: start, lte: end },
      // Only expenses (negative amounts) for spending charts
      amount: { lt: 0 },
    },
    select: {
      date: true,
      amount: true,
      categoryRef: { select: { name: true, group: { select: { name: true } } } },
      payee: { select: { name: true } },
      account: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  })

  return rows.map((r) => ({
    date: r.date,
    // Store as positive number for display
    amount: Math.abs(Number(r.amount)),
    category: r.categoryRef?.name ?? 'Uncategorized',
    categoryGroup: r.categoryRef?.group?.name ?? 'No Group',
    payee: r.payee?.name ?? 'Unknown',
    account: r.account?.name ?? 'Unknown',
  }))
}

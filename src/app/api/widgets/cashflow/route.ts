import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { resolveDateRange } from '@/lib/widgets/date-utils'
import { format, startOfMonth } from 'date-fns'

export interface CashflowPoint {
  label: string   // 'YYYY-MM'
  income: number  // positive
  expenses: number // negative (stored as negative for chart positioning)
  net: number
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') ?? 'last-6-months'
    const customStart = searchParams.get('start')
    const customEnd = searchParams.get('end')
    // comma-separated category names; empty/absent = all
    const categoriesParam = searchParams.get('categories')
    const categoryNames = categoriesParam ? categoriesParam.split(',').filter(Boolean) : []

    const dateRange = customStart && customEnd
      ? { type: 'static' as const, start: customStart, end: customEnd }
      : { type: 'live' as const, period: period as 'last-3-months' | 'last-6-months' | 'last-12-months' | 'ytd' | 'all-time' }

    const { start, end } = resolveDateRange(dateRange)

    // Build category filter if needed
    let categoryFilter: object | undefined
    if (categoryNames.length > 0) {
      const hasUncategorized = categoryNames.includes('Uncategorized')
      const namedCategories = categoryNames.filter((n) => n !== 'Uncategorized')

      if (hasUncategorized && namedCategories.length > 0) {
        categoryFilter = {
          OR: [
            { categoryId: null },
            { categoryRef: { name: { in: namedCategories } } },
          ],
        }
      } else if (hasUncategorized) {
        categoryFilter = { categoryId: null }
      } else {
        categoryFilter = { categoryRef: { name: { in: namedCategories } } }
      }
    }

    const rows = await prisma.transaction.findMany({
      where: {
        account: { userId },
        date: { gte: start, lte: end },
        ...categoryFilter,
      },
      select: { date: true, amount: true },
      orderBy: { date: 'asc' },
    })

    // Build month buckets
    const buckets = new Map<string, { income: number; expenses: number }>()

    // Pre-populate all months in range so there are no gaps
    let cursor = startOfMonth(start)
    while (cursor <= end) {
      buckets.set(format(cursor, 'yyyy-MM'), { income: 0, expenses: 0 })
      cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
    }

    for (const row of rows) {
      const key = format(new Date(row.date), 'yyyy-MM')
      const bucket = buckets.get(key)
      if (!bucket) continue
      const amt = Number(row.amount)
      if (amt > 0) bucket.income += amt
      else bucket.expenses += amt  // keep negative
    }

    const data: CashflowPoint[] = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, { income, expenses }]) => ({
        label,
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        net: Math.round((income + expenses) * 100) / 100,
      }))

    return ok(data)
  } catch (err) {
    console.error('[GET /api/widgets/cashflow]', err)
    return serverError('Failed to fetch cashflow data')
  }
}

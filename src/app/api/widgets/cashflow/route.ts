import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { resolveDateRange } from '@/lib/widgets/date-utils'
import { format, startOfMonth } from 'date-fns'
import { getRate } from '@/lib/fx'
import type { DashboardCurrency } from '@/lib/fx'

export interface CashflowPoint {
  label: string
  income: number   // positive
  expenses: number // positive (absolute value)
  net: number      // income - expenses
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') ?? 'last-6-months'
    const customStart = searchParams.get('start')
    const customEnd = searchParams.get('end')
    const currency = (searchParams.get('currency') ?? 'USD') as DashboardCurrency
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
        // Exclude non-deductible groups (account transfers, owner draws, etc.)
        // unless the user has explicitly filtered to specific categories
        ...(!categoryFilter ? { NOT: { categoryRef: { group: { taxType: 'non_deductible' } } } } : {}),
        ...categoryFilter,
      },
      select: { date: true, amount: true, account: { select: { currency: true } } },
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

    // Prefetch all distinct (sourceCurrency, month) rate pairs in parallel
    const ratePairs = new Set<string>()
    for (const row of rows) {
      const acctCurrency = row.account.currency
      if (acctCurrency !== currency) {
        ratePairs.add(`${acctCurrency}:${format(new Date(row.date), 'yyyy-MM')}`)
      }
    }
    await Promise.all(
      [...ratePairs].map(async (key) => {
        const [from, month] = key.split(':')
        await getRate(from, currency, month)
      }),
    )

    for (const row of rows) {
      const key = format(new Date(row.date), 'yyyy-MM')
      const bucket = buckets.get(key)
      if (!bucket) continue
      const rawAmt = Number(row.amount)
      const rate = await getRate(row.account.currency, currency, key)
      const amt = rawAmt * rate
      if (amt > 0) bucket.income += amt
      else bucket.expenses += Math.abs(amt)  // store as positive
    }

    const data: CashflowPoint[] = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, { income, expenses }]) => ({
        label,
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        net: Math.round((income - expenses) * 100) / 100,
      }))

    return ok(data)
  } catch (err) {
    console.error('[GET /api/widgets/cashflow]', err)
    return serverError('Failed to fetch cashflow data')
  }
}

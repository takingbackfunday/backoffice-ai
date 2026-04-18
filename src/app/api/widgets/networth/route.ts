import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { resolveDateRange } from '@/lib/widgets/date-utils'
import { format, startOfMonth } from 'date-fns'
import { getRate } from '@/lib/fx'
import type { DashboardCurrency } from '@/lib/fx'

export interface NetWorthPoint {
  label: string    // 'YYYY-MM'
  netWorth: number // cumulative running total up to this month
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') ?? 'all-time'
    const customStart = searchParams.get('start')
    const customEnd = searchParams.get('end')
    const currency = (searchParams.get('currency') ?? 'USD') as DashboardCurrency
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

    // Fetch ALL transactions (no date filter) — needed for correct cumulative totals
    const rows = await prisma.transaction.findMany({
      where: {
        account: { userId },
        ...categoryFilter,
      },
      select: { date: true, amount: true, account: { select: { currency: true } } },
      orderBy: { date: 'asc' },
    })

    // Prefetch all rate pairs in parallel before the loop
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

    // Group by month bucket (converted)
    const buckets = new Map<string, number>()
    for (const row of rows) {
      const key = format(new Date(row.date), 'yyyy-MM')
      const rate = await getRate(row.account.currency, currency, key)
      const converted = Number(row.amount) * rate
      buckets.set(key, (buckets.get(key) ?? 0) + converted)
    }

    // Compute cumulative running total across all months
    const sortedMonths = [...buckets.keys()].sort()
    const cumulative = new Map<string, number>()
    let running = 0
    for (const month of sortedMonths) {
      running += buckets.get(month)!
      cumulative.set(month, Math.round(running * 100) / 100)
    }

    // If period is all-time, derive start from the earliest actual transaction
    // rather than the hardcoded Jan 2000 fallback in resolveDateRange
    const effectiveStart = (period === 'all-time' && !customStart && rows.length > 0)
      ? new Date(rows[0].date)
      : start

    // Pre-populate window months so there are no gaps in the returned range
    const windowMonths: string[] = []
    let cursor = startOfMonth(effectiveStart)
    while (cursor <= end) {
      windowMonths.push(format(cursor, 'yyyy-MM'))
      cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
    }

    // For months in window with no transactions, carry forward the last known cumulative value
    let lastKnown = 0
    for (const month of sortedMonths) {
      if (month < windowMonths[0]) lastKnown = cumulative.get(month) ?? lastKnown
      else break
    }

    const data: NetWorthPoint[] = windowMonths.map((label) => {
      if (cumulative.has(label)) {
        lastKnown = cumulative.get(label)!
      }
      return { label, netWorth: lastKnown }
    })

    return ok(data)
  } catch (err) {
    console.error('[GET /api/widgets/networth]', err)
    return serverError('Failed to fetch net worth data')
  }
}

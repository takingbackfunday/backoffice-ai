import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { convertAmounts } from '@/lib/fx'
import type { DashboardCurrency } from '@/lib/fx'

export interface KpiData {
  revenue: number
  expenses: number
  savingRate: number   // (revenue - expenses) / revenue, or null if revenue = 0
  netWorth: number
  // MoM deltas as percentage points (null if previous month has no data)
  revenueDelta: number | null
  expensesDelta: number | null
  savingRateDelta: number | null
  netWorthDelta: number | null
  month: string  // 'YYYY-MM' of the reported month
  currency: string
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const currency = (searchParams.get('currency') ?? 'USD') as DashboardCurrency

    const now = new Date()
    // Last full completed month
    const lastMonth = subMonths(now, 1)
    const thisStart = startOfMonth(lastMonth)
    const thisEnd = endOfMonth(lastMonth)

    // Previous month (for MoM delta)
    const prevMonth = subMonths(now, 2)
    const prevStart = startOfMonth(prevMonth)
    const prevEnd = endOfMonth(prevMonth)

    // Exclude transactions in non-deductible category groups (e.g. "Account transfer",
    // "Transfers & other") — these inflate both revenue and expenses and are not real
    // income or spending regardless of the user's business-type category config.
    const excludeNonDeductible = {
      NOT: {
        categoryRef: {
          group: { taxType: 'non_deductible' },
        },
      },
    }

    const [thisRows, prevRows, allRows] = await Promise.all([
      prisma.transaction.findMany({
        where: { account: { userId }, date: { gte: thisStart, lte: thisEnd }, ...excludeNonDeductible },
        select: { amount: true, date: true, account: { select: { currency: true } } },
      }),
      prisma.transaction.findMany({
        where: { account: { userId }, date: { gte: prevStart, lte: prevEnd }, ...excludeNonDeductible },
        select: { amount: true, date: true, account: { select: { currency: true } } },
      }),
      // Net worth uses ALL transactions — transfers still move money between accounts
      prisma.transaction.findMany({
        where: { account: { userId } },
        select: { amount: true, date: true, account: { select: { currency: true } } },
      }),
    ])

    // Convert amounts to target currency using monthly rates
    const toConvertRows = (rows: { amount: unknown; date: Date; account: { currency: string } }[]) =>
      rows.map((r) => ({
        amount: Number(r.amount),
        currency: r.account.currency,
        month: format(r.date, 'yyyy-MM'),
      }))

    const [thisConverted, prevConverted, allConverted] = await Promise.all([
      convertAmounts(toConvertRows(thisRows), currency),
      convertAmounts(toConvertRows(prevRows), currency),
      convertAmounts(toConvertRows(allRows), currency),
    ])

    function calcMonthStats(amounts: number[]) {
      let revenue = 0
      let expenses = 0
      for (const amt of amounts) {
        if (amt > 0) revenue += amt
        else expenses += Math.abs(amt)
      }
      const savingRate = revenue > 0 ? (revenue - expenses) / revenue : 0
      return { revenue, expenses, savingRate }
    }

    const thisStats = calcMonthStats(thisConverted)
    const prevStats = calcMonthStats(prevConverted)

    const netWorth = allConverted.reduce((sum, amt) => sum + amt, 0)
    // Net worth previous month = netWorth minus this month's net
    const thisNet = thisStats.revenue - thisStats.expenses
    const prevNetWorth = netWorth - thisNet

    function pctDelta(curr: number, prev: number): number | null {
      if (prev === 0) return null
      return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10  // 1dp
    }

    const month = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`

    const result: KpiData = {
      revenue: Math.round(thisStats.revenue * 100) / 100,
      expenses: Math.round(thisStats.expenses * 100) / 100,
      savingRate: Math.round(thisStats.savingRate * 1000) / 10,  // percentage
      netWorth: Math.round(netWorth * 100) / 100,
      revenueDelta: pctDelta(thisStats.revenue, prevStats.revenue),
      expensesDelta: pctDelta(thisStats.expenses, prevStats.expenses),
      savingRateDelta: prevStats.savingRate > 0
        ? Math.round((thisStats.savingRate - prevStats.savingRate) * 1000) / 10
        : null,
      netWorthDelta: pctDelta(netWorth, prevNetWorth),
      month,
      currency,
    }

    return ok(result)
  } catch (err) {
    console.error('[GET /api/widgets/kpi]', err)
    return serverError('Failed to fetch KPI data')
  }
}

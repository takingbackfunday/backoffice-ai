'use client'

import type { PreviewRow } from '@/types'
import { money, fmtMoney } from '@/lib/money'

export interface PreviewTotals {
  expenseCount: number
  expenseSum: string
  revenueCount: number
  revenueSum: string
  totalCount: number
  net: string
  netNegative: boolean
}

/** Totals over rows that will actually be imported (duplicates excluded). */
export function computePreviewTotals(rows: PreviewRow[]): PreviewTotals {
  const fresh = rows.filter((r) => !r.isDuplicate)
  const expenses = fresh.filter((r) => r.amount < 0)
  const revenue = fresh.filter((r) => r.amount > 0)

  const expenseSum = expenses.reduce((acc, r) => acc.plus(r.amount), money(0))
  const revenueSum = revenue.reduce((acc, r) => acc.plus(r.amount), money(0))
  const net = revenueSum.plus(expenseSum)

  return {
    expenseCount: expenses.length,
    expenseSum: fmtMoney(expenseSum),
    revenueCount: revenue.length,
    revenueSum: fmtMoney(revenueSum),
    totalCount: fresh.length,
    net: fmtMoney(net.abs()),
    netNegative: net.isNegative(),
  }
}

export function PreviewTotals({
  rows,
  loading,
}: {
  rows: PreviewRow[]
  loading: boolean
}) {
  if (loading || rows.length === 0) return null

  const t = computePreviewTotals(rows)

  return (
    <div
      className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs"
      data-testid="preview-totals"
      title="Totals for transactions that will be imported (duplicates excluded)"
    >
      <span className="text-red-600" data-testid="preview-totals-expenses">
        <strong>{t.expenseCount}</strong> expense{t.expenseCount !== 1 ? 's' : ''} · {t.expenseSum}
      </span>
      <span className="text-green-600" data-testid="preview-totals-revenue">
        <strong>{t.revenueCount}</strong> revenue · +{t.revenueSum}
      </span>
      <span data-testid="preview-totals-net">
        <strong>{t.totalCount}</strong> total · net{' '}
        <span className={t.netNegative ? 'text-red-600' : 'text-green-600'}>
          {t.netNegative ? '−' : '+'}{t.net}
        </span>
      </span>
    </div>
  )
}

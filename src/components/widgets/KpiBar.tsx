'use client'

import { useEffect, useState } from 'react'
import type { KpiData } from '@/app/api/widgets/kpi/route'

function fmt(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return null
  // invert: for expenses, a positive delta (spent more) is bad
  const isGood = invert ? value <= 0 : value >= 0
  const sign = value > 0 ? '+' : ''
  return (
    <span className={`text-[10px] font-medium ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
      {sign}{value}%
    </span>
  )
}

function KpiCard({
  label,
  value,
  delta,
  invertDelta,
  sub,
}: {
  label: string
  value: string
  delta: number | null
  invertDelta?: boolean
  sub?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 border-r border-black/[0.06] last:border-r-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums tracking-tight">{value}</span>
        <Delta value={delta} invert={invertDelta} />
      </div>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

export function KpiBar() {
  const [data, setData] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/widgets/kpi')
      .then((r) => r.json())
      .then((json) => { if (!json.error) setData(json.data) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border bg-white flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-[#534AB7] border-t-transparent animate-spin" />
        Loading KPIs…
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center divide-x divide-black/[0.06]">
        <div className="px-4 py-3 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Last month</p>
          <p className="text-xs font-medium text-foreground mt-0.5">{monthLabel(data.month)}</p>
        </div>
        <KpiCard
          label="Revenue"
          value={fmt(data.revenue)}
          delta={data.revenueDelta}
        />
        <KpiCard
          label="Expenses"
          value={fmt(data.expenses)}
          delta={data.expensesDelta}
          invertDelta
        />
        <KpiCard
          label="Saving rate"
          value={`${data.savingRate}%`}
          delta={data.savingRateDelta}
          sub="% of revenue kept"
        />
        <KpiCard
          label="Net worth"
          value={fmt(data.netWorth)}
          delta={data.netWorthDelta}
        />
      </div>
    </div>
  )
}

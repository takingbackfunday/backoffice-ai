'use client'

import { useState } from 'react'
import {
  add, sub, format,
  startOfWeek, startOfMonth, startOfQuarter, startOfYear,
  subDays,
  type Duration,
} from 'date-fns'

// ── Types ──────────────────────────────────────────────────────────────────────

export type Anchor   = 'today' | 'yesterday' | 'start-of-week' | 'start-of-month' | 'start-of-quarter' | 'start-of-year'
export type Operator = 'minus' | 'plus'
export type Unit     = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface RelativeDateExpr {
  anchor: Anchor
  operator: Operator
  value: number
  unit: Unit
}

export interface RelativeDateRange {
  start: RelativeDateExpr
  end: RelativeDateExpr
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

export function resolveExpr(expr: RelativeDateExpr): Date {
  const today = new Date()
  let base: Date
  switch (expr.anchor) {
    case 'today':            base = today; break
    case 'yesterday':        base = subDays(today, 1); break
    case 'start-of-week':    base = startOfWeek(today); break
    case 'start-of-month':   base = startOfMonth(today); break
    case 'start-of-quarter': base = startOfQuarter(today); break
    case 'start-of-year':    base = startOfYear(today); break
  }

  if (expr.value === 0) return base

  const duration: Duration = {}
  switch (expr.unit) {
    case 'day':     duration.days    = expr.value; break
    case 'week':    duration.weeks   = expr.value; break
    case 'month':   duration.months  = expr.value; break
    case 'quarter': duration.months  = expr.value * 3; break
    case 'year':    duration.years   = expr.value; break
  }

  return expr.operator === 'minus' ? sub(base, duration) : add(base, duration)
}

export function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

// ── Sub-component: expression editor for one side ─────────────────────────────

const ANCHOR_OPTIONS: { value: Anchor; label: string }[] = [
  { value: 'today',            label: 'Today' },
  { value: 'yesterday',        label: 'Yesterday' },
  { value: 'start-of-week',    label: 'Start of week' },
  { value: 'start-of-month',   label: 'Start of month' },
  { value: 'start-of-quarter', label: 'Start of quarter' },
  { value: 'start-of-year',    label: 'Start of year' },
]

const OPERATOR_OPTIONS: { value: Operator; label: string }[] = [
  { value: 'minus', label: 'Minus' },
  { value: 'plus',  label: 'Plus' },
]

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'day',     label: 'Day' },
  { value: 'week',    label: 'Week' },
  { value: 'month',   label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year',    label: 'Year' },
]

const SELECT_CLASS = 'text-xs border border-black/15 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30'

function ExprEditor({
  value,
  onChange,
}: {
  value: RelativeDateExpr
  onChange: (next: RelativeDateExpr) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select
        value={value.anchor}
        onChange={(e) => onChange({ ...value, anchor: e.target.value as Anchor })}
        className={SELECT_CLASS}
      >
        {ANCHOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={value.operator}
        onChange={(e) => onChange({ ...value, operator: e.target.value as Operator })}
        className={SELECT_CLASS}
      >
        {OPERATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        step={1}
        value={value.value}
        onChange={(e) => onChange({ ...value, value: Math.max(0, Math.floor(Number(e.target.value))) })}
        className={`${SELECT_CLASS} w-16`}
      />
      <select
        value={value.unit}
        onChange={(e) => onChange({ ...value, unit: e.target.value as Unit })}
        className={SELECT_CLASS}
      >
        {UNIT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  value: RelativeDateRange
  onChange: (next: RelativeDateRange) => void
  onApply: (start: string, end: string) => void
  onCancel: () => void
  /** Pass applied dates so the summary can show them on initial hydration */
  appliedStart?: string
  appliedEnd?: string
}

export function RelativeDateRangePicker({ value, onChange, onApply, onCancel, appliedStart, appliedEnd }: Props) {
  const [editing, setEditing] = useState(!appliedStart || !appliedEnd)

  const startDate = resolveExpr(value.start)
  const endDate   = resolveExpr(value.end)
  const invalid   = startDate > endDate

  const fmtPreview = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  const fmtSummary = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function handleApply() {
    if (invalid) return
    const s = toDateString(startDate)
    const e = toDateString(endDate)
    onApply(s, e)
    setEditing(false)
  }

  // ── Collapsed summary ──
  if (!editing && appliedStart && appliedEnd) {
    return (
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">Custom:</span>
        <span className="text-xs font-medium text-foreground">
          {fmtSummary(appliedStart)} – {fmtSummary(appliedEnd)}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-xs px-2 py-1 rounded-md border border-black/15 text-muted-foreground hover:text-foreground hover:border-black/25 transition-colors"
        >
          Edit
        </button>
      </div>
    )
  }

  // ── Editor ──
  return (
    <div className="mb-4 p-3 rounded-lg border border-black/10 bg-muted/20">
      <div className="grid grid-cols-2 gap-4">
        {/* Start */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Start date</p>
          <p className="text-xs text-muted-foreground">{fmtPreview(startDate)}</p>
          <ExprEditor
            value={value.start}
            onChange={(next) => onChange({ ...value, start: next })}
          />
        </div>

        {/* End */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">End date</p>
          <p className="text-xs text-muted-foreground">{fmtPreview(endDate)}</p>
          <ExprEditor
            value={value.end}
            onChange={(next) => onChange({ ...value, end: next })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        {invalid ? (
          <p className="text-xs text-red-500">Start must be before end</p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border border-black/15 text-muted-foreground hover:text-foreground hover:border-black/25 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={invalid}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#3C3489] text-white font-medium disabled:opacity-40 hover:bg-[#2e2870] transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

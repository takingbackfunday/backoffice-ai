'use client'

import { cn } from '@/lib/utils'

interface Props {
  effectiveTotal: number
  totalInvoiced: number
  totalPaid: number
  currency: string
  className?: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

export function FulfillmentBar({ effectiveTotal, totalInvoiced, totalPaid, currency, className }: Props) {
  if (effectiveTotal <= 0) return null

  const paidPct = Math.min(100, (totalPaid / effectiveTotal) * 100)
  const outstandingPct = Math.min(100 - paidPct, ((totalInvoiced - totalPaid) / effectiveTotal) * 100)
  const uninvoicedPct = Math.max(0, 100 - paidPct - outstandingPct)
  const totalOutstanding = totalInvoiced - totalPaid
  const uninvoiced = effectiveTotal - totalInvoiced

  return (
    <div className={cn('space-y-2', className)}>
      {/* Bar */}
      <div className="h-3 rounded-full bg-muted overflow-hidden flex">
        {paidPct > 0 && (
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${paidPct}%` }}
          />
        )}
        {outstandingPct > 0 && (
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${outstandingPct}%` }}
          />
        )}
        {uninvoicedPct > 0 && (
          <div
            className="h-full bg-muted-foreground/20 transition-all"
            style={{ width: `${uninvoicedPct}%` }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500" />
          <span>Paid {fmt(totalPaid, currency)}</span>
        </div>
        {totalOutstanding > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400" />
            <span>Outstanding {fmt(totalOutstanding, currency)}</span>
          </div>
        )}
        {uninvoiced > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />
            <span>Uninvoiced {fmt(uninvoiced, currency)}</span>
          </div>
        )}
        <div className="ml-auto font-medium text-foreground">
          Agreement: {fmt(effectiveTotal, currency)}
        </div>
      </div>
    </div>
  )
}

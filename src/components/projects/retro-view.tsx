'use client'

import { cn } from '@/lib/utils'

interface RetroSection {
  name: string
  estimatedCost: number
  quotedPrice: number
  actualCost: number | null
  invoicedAmount: number
}

interface RetroData {
  sections: RetroSection[]
  currency: string
}

interface Props {
  data: RetroData
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function pct(n: number) {
  return isFinite(n) && !isNaN(n) ? `${n.toFixed(0)}%` : '—'
}

export function RetroView({ data }: Props) {
  const { sections, currency } = data

  const totals = sections.reduce((acc, s) => ({
    estimatedCost: acc.estimatedCost + s.estimatedCost,
    quotedPrice: acc.quotedPrice + s.quotedPrice,
    actualCost: acc.actualCost !== null && s.actualCost !== null ? acc.actualCost + s.actualCost : null,
    invoicedAmount: acc.invoicedAmount + s.invoicedAmount,
  }), { estimatedCost: 0, quotedPrice: 0, actualCost: null as number | null, invoicedAmount: 0 })

  const effectiveMarginTotal = totals.actualCost !== null && totals.invoicedAmount > 0
    ? ((totals.invoicedAmount - totals.actualCost) / totals.invoicedAmount) * 100
    : null
  const quoteMarginTotal = totals.estimatedCost > 0
    ? ((totals.quotedPrice - totals.estimatedCost) / totals.quotedPrice) * 100
    : null

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Line Item</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Estimated Cost</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Quoted Price</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actual Cost</th>
              <th className="text-right py-2 pl-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoiced</th>
              <th className="text-right py-2 pl-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sections.map((s, i) => {
              const quoteMargin = s.quotedPrice > 0 ? ((s.quotedPrice - s.estimatedCost) / s.quotedPrice) * 100 : null
              const effectiveMargin = s.actualCost !== null && s.invoicedAmount > 0
                ? ((s.invoicedAmount - s.actualCost) / s.invoicedAmount) * 100
                : null
              const estimationAccuracy = s.estimatedCost > 0 && s.actualCost !== null
                ? (s.actualCost / s.estimatedCost) * 100
                : null

              return (
                <tr key={i}>
                  <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">{fmt(s.estimatedCost, currency)}</td>
                  <td className="py-2.5 px-3 text-right">{fmt(s.quotedPrice, currency)}</td>
                  <td className="py-2.5 px-3 text-right">
                    {s.actualCost !== null ? (
                      <span className={cn(
                        estimationAccuracy !== null && estimationAccuracy > 115 ? 'text-red-600' :
                        estimationAccuracy !== null && estimationAccuracy > 100 ? 'text-amber-600' :
                        'text-muted-foreground'
                      )}>
                        {fmt(s.actualCost, currency)}
                        {estimationAccuracy !== null && (
                          <span className="text-xs ml-1">({pct(estimationAccuracy)})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pl-3 text-right">{fmt(s.invoicedAmount, currency)}</td>
                  <td className="py-2.5 pl-3 text-right">
                    {effectiveMargin !== null ? (
                      <span className={cn(effectiveMargin < 0 ? 'text-red-600' : effectiveMargin < 20 ? 'text-amber-600' : 'text-green-600')}>
                        {pct(effectiveMargin)}
                      </span>
                    ) : quoteMargin !== null ? (
                      <span className="text-muted-foreground">{pct(quoteMargin)}</span>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t-2">
            <tr className="font-semibold">
              <td className="py-3 pr-4">Total</td>
              <td className="py-3 px-3 text-right text-muted-foreground">{fmt(totals.estimatedCost, currency)}</td>
              <td className="py-3 px-3 text-right">{fmt(totals.quotedPrice, currency)}</td>
              <td className="py-3 px-3 text-right">
                {totals.actualCost !== null ? fmt(totals.actualCost, currency) : <span className="text-muted-foreground/50">—</span>}
              </td>
              <td className="py-3 pl-3 text-right">{fmt(totals.invoicedAmount, currency)}</td>
              <td className="py-3 pl-3 text-right">
                {effectiveMarginTotal !== null ? (
                  <span className={cn(effectiveMarginTotal < 0 ? 'text-red-600' : effectiveMarginTotal < 20 ? 'text-amber-600' : 'text-green-600')}>
                    {pct(effectiveMarginTotal)}
                  </span>
                ) : quoteMarginTotal !== null ? (
                  <span className="text-muted-foreground">{pct(quoteMarginTotal)}</span>
                ) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Metrics summary */}
      <div className="grid grid-cols-3 gap-4 text-sm border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Quote Margin</p>
          <p className="text-lg font-semibold mt-1">
            {quoteMarginTotal !== null ? pct(quoteMarginTotal) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">What you planned to earn</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Effective Margin</p>
          <p className={cn('text-lg font-semibold mt-1',
            effectiveMarginTotal !== null && effectiveMarginTotal < 0 ? 'text-red-600' :
            effectiveMarginTotal !== null && effectiveMarginTotal < 20 ? 'text-amber-600' :
            effectiveMarginTotal !== null ? 'text-green-600' : ''
          )}>
            {effectiveMarginTotal !== null ? pct(effectiveMarginTotal) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Actual profit vs. invoiced</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Margin Erosion</p>
          <p className={cn('text-lg font-semibold mt-1',
            quoteMarginTotal !== null && effectiveMarginTotal !== null && (quoteMarginTotal - effectiveMarginTotal) > 5 ? 'text-red-600' : ''
          )}>
            {quoteMarginTotal !== null && effectiveMarginTotal !== null
              ? pct(quoteMarginTotal - effectiveMarginTotal)
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Points lost vs. plan</p>
        </div>
      </div>
    </div>
  )
}

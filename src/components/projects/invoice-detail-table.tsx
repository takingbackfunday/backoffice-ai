'use client'

import { cn } from '@/lib/utils'
import { toDisplay } from '@/lib/money'

interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  isTaxLine?: boolean
}

interface Payment {
  id: string
  amount: number
  paidDate: string
  paymentMethod: string | null
}

interface Props {
  lineItems: LineItem[]
  payments: Payment[]
  currency: string
  total: number
  balance: number
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

export function InvoiceDetailTable({ lineItems, payments, currency, total, balance }: Props) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <colgroup>
          <col />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-28" />
        </colgroup>
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
            <th className="text-right px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Qty</th>
            <th className="text-right px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Unit Price</th>
            <th className="text-right px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lineItems.map(item => (
            <tr key={item.id}>
              <td className={cn('px-4 py-1 whitespace-normal break-words', item.isTaxLine && 'text-muted-foreground italic')}>
                {item.description}
              </td>
              <td className="px-4 py-1 text-right text-muted-foreground tabular-nums">
                {toDisplay(item.quantity) % 1 === 0 ? toDisplay(item.quantity) : toDisplay(item.quantity).toFixed(3)}
              </td>
              <td className="px-4 py-1 text-right tabular-nums">{fmt(toDisplay(item.unitPrice), currency)}</td>
              <td className="px-4 py-1 text-right font-medium tabular-nums">
                {fmt(toDisplay(item.quantity) * toDisplay(item.unitPrice), currency)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-muted/20">
          <tr>
            <td colSpan={3} className="px-4 py-1.5 text-right font-semibold">Total</td>
            <td className="px-4 py-1.5 text-right font-semibold tabular-nums">{fmt(toDisplay(total), currency)}</td>
          </tr>
          {payments.map(p => (
            <tr key={p.id}>
              <td colSpan={2} className="px-4 py-1 text-right text-xs text-green-700">
                Payment · {new Date(p.paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {p.paymentMethod && <span className="text-muted-foreground"> · {p.paymentMethod}</span>}
              </td>
              <td colSpan={2} className="px-4 py-1 text-right text-xs font-semibold text-green-700 tabular-nums">
                −{fmt(toDisplay(p.amount), currency)}
              </td>
            </tr>
          ))}
          <tr className="border-t">
            <td colSpan={3} className="px-4 py-2 text-right text-xs font-bold">Balance due</td>
            <td className={cn('px-4 py-2 text-right text-xs font-bold tabular-nums', toDisplay(balance) <= 0 ? 'text-green-700' : '')}>
              {fmt(toDisplay(balance), currency)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

'use client'

import { cn } from '@/lib/utils'

interface LineItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  isOptional: boolean
  costRate: number | null
  tags: string[]
}

interface Section {
  id: string
  name: string
  sortOrder: number
  items: LineItem[]
}

interface Props {
  sections: Section[]
  currency: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

function sectionSubtotal(items: LineItem[]): number {
  return items.filter(i => !i.isOptional).reduce((s, i) => s + i.unitPrice * i.quantity, 0)
}

function optionalTotal(items: LineItem[]): number {
  return items.filter(i => i.isOptional).reduce((s, i) => s + i.unitPrice * i.quantity, 0)
}

export function QuoteDetailTable({ sections, currency }: Props) {
  const subtotal = sections.reduce((sum, s) => sum + sectionSubtotal(s.items), 0)
  const optTotal = sections.reduce((sum, s) => sum + optionalTotal(s.items), 0)
  const hasOptional = optTotal > 0

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Qty</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Unit Price</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sections.map(section => (
            <tr key={`section-row-${section.id}`}>
              <td colSpan={4} className="p-0">
                <table className="w-full">
                  {sections.length > 1 && (
                    <thead>
                      <tr className="bg-muted/20">
                        <th colSpan={4} className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left">
                          {section.name}
                        </th>
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {section.items.map(item => (
                      <tr key={item.id} className={cn(item.isOptional && 'opacity-60')}>
                        <td className="px-4 py-2.5">
                          {item.description}
                          {item.isOptional && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                          {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(item.unitPrice, currency)}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                          {fmt(item.unitPrice * item.quantity, currency)}
                        </td>
                      </tr>
                    ))}
                    {/* Section subtotal when > 1 section */}
                    {sections.length > 1 && (
                      <tr className="bg-muted/10">
                        <td colSpan={3} className="px-4 py-1 text-right text-xs font-medium text-muted-foreground">
                          Section subtotal
                        </td>
                        <td className="px-4 py-1 text-right text-xs font-medium text-muted-foreground tabular-nums">
                          {fmt(sectionSubtotal(section.items), currency)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-muted/20">
          {hasOptional && (
            <tr>
              <td colSpan={3} className="px-4 py-1.5 text-right text-xs text-muted-foreground">
                Optional items (excluded)
              </td>
              <td className="px-4 py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                {fmt(optTotal, currency)}
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={3} className="px-4 py-3 text-right font-semibold">Total</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmt(subtotal, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

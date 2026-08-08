'use client'

import { Trash2, Bookmark, Check } from 'lucide-react'
import type { ItemInput } from './hooks/use-quote-form'
import type { LibraryStatus } from './hooks/use-save-to-library'
import { itemMarginPercent } from '@/lib/quote-pricing'

interface Props {
  section: { id: string; name: string; items: ItemInput[] }
  marginRules: { tag: string; marginPct: number }[]
  showCosts: boolean
  libraryStatus?: Record<string, LibraryStatus>
  onUpdateItem: (itemId: string, field: string, value: unknown) => void
  onRemoveItem: (itemId: string) => void
  onSaveToLibrary: (item: ItemInput) => void
}

const RISK_LEVELS = ['low', 'medium', 'high']

export function QuoteLineItemsTable({ section, marginRules, showCosts, libraryStatus, onUpdateItem, onRemoveItem, onSaveToLibrary }: Props) {
  return (
    <table className="w-full text-sm border-collapse">
      <colgroup>
        <col />
        <col className="w-24" />
        <col className="w-28" />
        {showCosts && <col className="w-20" />}
        {showCosts && <col className="w-28" />}
        {showCosts && <col className="w-20" />}
        {showCosts && <col className="w-16" />}
        {showCosts && <col className="w-16" />}
        <col className="w-10" />
      </colgroup>
      <thead>
        <tr className="border-b">
          <th className="text-left px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
          <th className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Qty</th>
          <th className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Price</th>
          {showCosts && <th className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Cost rt</th>}
          {showCosts && <th className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tags</th>}
          {showCosts && <th className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Int. notes</th>}
          {showCosts && <th className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Risk</th>}
          {showCosts && <th className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Margin</th>}
          <th />
        </tr>
      </thead>
      <tbody>
        {section.items.map((item) => {
          const costRate = parseFloat(item.costRate) || 0
          const unitPrice = parseFloat(item.unitPrice) || 0
          const marginPct = itemMarginPercent(costRate || null, unitPrice)

          return (
            <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/20 group">
              <td className="px-4 py-1">
                <div className="flex items-start gap-1">
                  <textarea
                    value={item.description}
                    onChange={e => {
                      onUpdateItem(item.id, 'description', e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    placeholder="Item description"
                    className="text-sm focus:outline-none bg-transparent placeholder:text-muted-foreground/50 min-w-0 w-full resize-none overflow-hidden leading-snug py-0.5"
                    rows={1}
                  />
                  {item.description.trim() && (() => {
                    const status = libraryStatus?.[item.id]
                    if (status === 'saved') {
                      return (
                        <button
                          onClick={() => onSaveToLibrary(item)}
                          className="shrink-0 text-emerald-600"
                          title="Saved to library"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )
                    }
                    if (status === 'duplicate') {
                      return (
                        <button
                          onClick={() => onSaveToLibrary(item)}
                          className="shrink-0 text-amber-500"
                          title="Already in library"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                        </button>
                      )
                    }
                    if (status === 'error') {
                      return (
                        <button
                          onClick={() => onSaveToLibrary(item)}
                          className="shrink-0 text-destructive"
                          title="Couldn't save (rate must be > 0)"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                        </button>
                      )
                    }
                    return (
                      <button
                        onClick={() => onSaveToLibrary(item)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                        title="Save to library"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                      </button>
                    )
                  })()}
                </div>
              </td>
              <td className="px-1 py-1">
                <div className="flex items-center gap-1 justify-end">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={e => onUpdateItem(item.id, 'quantity', e.target.value)}
                    placeholder="1"
                    className="text-sm text-right bg-transparent border-none outline-none w-10 tabular-nums focus:bg-muted/30 rounded"
                    step="1"
                  />
                  <input
                    type="text"
                    value={item.unit}
                    onChange={e => onUpdateItem(item.id, 'unit', e.target.value)}
                    placeholder="x"
                    className="text-sm bg-transparent border-none outline-none w-8 text-muted-foreground"
                  />
                </div>
              </td>
              <td className="px-1 py-1">
                <div className="flex items-center gap-1 justify-end">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={e => onUpdateItem(item.id, 'unitPrice', e.target.value)}
                    placeholder="0"
                    className="text-sm text-right bg-transparent border-none outline-none w-full tabular-nums focus:bg-muted/30 rounded"
                    step="0.01"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isOptional}
                      onChange={e => onUpdateItem(item.id, 'isOptional', e.target.checked)}
                      className="rounded"
                    />
                    opt
                  </label>
                </div>
              </td>
              {showCosts && (
                <td className="px-1 py-1">
                  <input
                    type="number"
                    value={item.costRate}
                    onChange={e => onUpdateItem(item.id, 'costRate', e.target.value)}
                    placeholder="—"
                    className="text-sm text-right bg-transparent border-none outline-none w-full tabular-nums focus:bg-muted/30 rounded"
                    step="0.01"
                  />
                </td>
              )}
              {showCosts && (
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={item.tags}
                    onChange={e => onUpdateItem(item.id, 'tags', e.target.value)}
                    placeholder="dev, design"
                    list="margin-tags"
                    className="text-sm bg-transparent border-none outline-none w-full text-muted-foreground"
                  />
                </td>
              )}
              {showCosts && (
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={item.internalNotes}
                    onChange={e => onUpdateItem(item.id, 'internalNotes', e.target.value)}
                    placeholder="—"
                    className="text-sm bg-transparent border-none outline-none w-full text-muted-foreground"
                  />
                </td>
              )}
              {showCosts && (
                <td className="px-1 py-1">
                  <select
                    value={item.riskLevel}
                    onChange={e => onUpdateItem(item.id, 'riskLevel', e.target.value)}
                    className="text-sm bg-transparent w-full"
                  >
                    {RISK_LEVELS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
              )}
              {showCosts && (
                <td className="px-1 py-1 text-right">
                  <span className="text-sm text-muted-foreground">
                    {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
                  </span>
                </td>
              )}
              <td className="px-1 py-1">
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
      <datalist id="margin-tags">
        {marginRules.map(r => (
          <option key={r.tag} value={r.tag} />
        ))}
      </datalist>
    </table>
  )
}

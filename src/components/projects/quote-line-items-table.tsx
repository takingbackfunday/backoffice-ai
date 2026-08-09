'use client'

import { Trash2, Bookmark, Check } from 'lucide-react'
import type { ItemInput } from './hooks/use-quote-form'
import type { LibraryStatus } from './hooks/use-save-to-library'
import { itemMarginPercent } from '@/lib/quote-pricing'

interface Props {
  section: { id: string; name: string; items: ItemInput[] }
  marginRules: { tag: string; marginPct: number }[]
  showCosts: boolean
  currency: string
  libraryStatus?: Record<string, LibraryStatus>
  onUpdateItem: (itemId: string, field: string, value: unknown) => void
  onRemoveItem: (itemId: string) => void
  onSaveToLibrary: (item: ItemInput) => void
}

const RISK_LEVELS = ['low', 'medium', 'high']

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

// Fixed pixel tracks for every non-description column so header, rows and
// subtotal align exactly — and every section table on the page shares the
// same geometry. Description is the only flexible column.
//   desc | qty | price | total | actions
const BASE_COLS = 'minmax(200px,1fr) 72px 96px 96px 32px'
//   desc | qty | price | total | cost | tags | notes | risk | margin | actions
const COSTS_COLS = 'minmax(200px,1fr) 72px 96px 96px 84px 112px 128px 76px 72px 32px'

const HEADER_CELL = 'px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap'
const CELL = 'px-2 py-1 min-w-0'

export function QuoteLineItemsTable({ section, marginRules, showCosts, currency, libraryStatus, onUpdateItem, onRemoveItem, onSaveToLibrary }: Props) {
  const sectionSubtotal = section.items.reduce((sum, i) => {
    const qty = parseFloat(i.quantity) || 1
    const price = parseFloat(i.unitPrice) || 0
    return sum + qty * price
  }, 0)

  const cols = showCosts ? COSTS_COLS : BASE_COLS

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* Header */}
        <div className="grid divide-x divide-border/60 bg-muted/20" style={{ gridTemplateColumns: cols }}>
          <div className={HEADER_CELL}>Description</div>
          <div className={`${HEADER_CELL} text-right`}>Qty</div>
          <div className={`${HEADER_CELL} text-right`}>Price</div>
          <div className={`${HEADER_CELL} text-right`}>Total</div>
          {showCosts && <div className={`${HEADER_CELL} text-right`}>Cost rt</div>}
          {showCosts && <div className={HEADER_CELL}>Tags</div>}
          {showCosts && <div className={HEADER_CELL}>Int. notes</div>}
          {showCosts && <div className={HEADER_CELL}>Risk</div>}
          {showCosts && <div className={`${HEADER_CELL} text-right`}>Margin</div>}
          <div />
        </div>

        {section.items.map((item) => {
          const costRate = parseFloat(item.costRate) || 0
          const unitPrice = parseFloat(item.unitPrice) || 0
          const quantity = parseFloat(item.quantity) || 1
          const lineTotal = quantity * unitPrice
          const marginPct = itemMarginPercent(costRate || null, unitPrice)

          return (
            <div
              key={item.id}
              className="grid divide-x divide-border/60 border-t hover:bg-muted/20 group"
              style={{ gridTemplateColumns: cols }}
            >
            <div className={`${CELL} pl-4`}>
              <div className="flex items-start gap-1">
                <textarea
                  value={item.description}
                  ref={el => {
                    if (el) {
                      el.style.height = 'auto'
                      el.style.height = el.scrollHeight + 'px'
                    }
                  }}
                  onChange={e => {
                    onUpdateItem(item.id, 'description', e.target.value)
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
            </div>
            {/* Qty: number on top, unit below — both right-aligned */}
            <div className={`${CELL} flex flex-col items-end gap-0.5`}>
              <input
                type="number"
                value={item.quantity}
                onChange={e => onUpdateItem(item.id, 'quantity', e.target.value)}
                placeholder="1"
                className="text-sm text-right bg-transparent border-none outline-none w-full tabular-nums focus:bg-muted/30 rounded"
                step="1"
              />
              <input
                type="text"
                value={item.unit}
                onChange={e => onUpdateItem(item.id, 'unit', e.target.value)}
                placeholder="x"
                className="text-xs text-right bg-transparent border-none outline-none w-full text-muted-foreground"
              />
            </div>
            {/* Price: amount on top, optional toggle below */}
            <div className={`${CELL} flex flex-col items-end gap-0.5`}>
              <input
                type="number"
                value={item.unitPrice}
                onChange={e => onUpdateItem(item.id, 'unitPrice', e.target.value)}
                placeholder="0"
                className="text-sm text-right bg-transparent border-none outline-none w-full tabular-nums focus:bg-muted/30 rounded"
                step="0.01"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.isOptional}
                  onChange={e => onUpdateItem(item.id, 'isOptional', e.target.checked)}
                  className="rounded"
                />
                opt
              </label>
            </div>
            <div className={`${CELL} text-right font-medium tabular-nums text-muted-foreground`}>
              {fmt(lineTotal, currency)}
            </div>
            {showCosts && (
              <div className={`${CELL} text-right`}>
                <input
                  type="number"
                  value={item.costRate}
                  onChange={e => onUpdateItem(item.id, 'costRate', e.target.value)}
                  placeholder="—"
                  className="text-sm text-right bg-transparent border-none outline-none w-full tabular-nums focus:bg-muted/30 rounded"
                  step="0.01"
                />
              </div>
            )}
            {showCosts && (
              <div className={CELL}>
                <input
                  type="text"
                  value={item.tags}
                  onChange={e => onUpdateItem(item.id, 'tags', e.target.value)}
                  placeholder="dev, design"
                  list="margin-tags"
                  className="text-sm bg-transparent border-none outline-none w-full text-muted-foreground"
                />
              </div>
            )}
            {showCosts && (
              <div className={CELL}>
                <input
                  type="text"
                  value={item.internalNotes}
                  onChange={e => onUpdateItem(item.id, 'internalNotes', e.target.value)}
                  placeholder="—"
                  className="text-sm bg-transparent border-none outline-none w-full text-muted-foreground"
                />
              </div>
            )}
            {showCosts && (
              <div className={CELL}>
                <select
                  value={item.riskLevel}
                  onChange={e => onUpdateItem(item.id, 'riskLevel', e.target.value)}
                  className="text-sm bg-transparent w-full"
                >
                  {RISK_LEVELS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}
            {showCosts && (
              <div className={`${CELL} text-right`}>
                <span className="text-sm text-muted-foreground">
                  {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
                </span>
              </div>
            )}
            <div className={`${CELL} flex items-start justify-center`}>
              <button
                onClick={() => onRemoveItem(item.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          )
        })}

        {/* Section subtotal */}
        <div className="grid divide-x divide-border/60 border-t bg-muted/10" style={{ gridTemplateColumns: cols }}>
          <div className="px-4 py-1 text-right text-xs font-medium text-muted-foreground" style={{ gridColumn: '1 / 4' }}>
            Section subtotal
          </div>
          <div className="px-2 py-1 text-right text-xs font-medium text-muted-foreground tabular-nums">
            {fmt(sectionSubtotal, currency)}
          </div>
        </div>
      </div>

      <datalist id="margin-tags">
        {marginRules.map(r => (
          <option key={r.tag} value={r.tag} />
        ))}
      </datalist>
    </div>
  )
}

'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface EstimateItem {
  id: string
  description: string
  hours: number | null
  costRate: number | null
  quantity: number
  unit: string | null
  tags: string[]
  isOptional: boolean
  internalNotes: string | null
}

interface EstimateSection {
  id: string
  name: string
  sortOrder: number
  items: EstimateItem[]
}

interface QuoteLineItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  isOptional: boolean
  hasEstimateLink: boolean
  costBasis: number | null
  marginPercent: number | null
  sourceItemIds: string[]
  sortOrder: number
}

interface QuoteSection {
  id: string
  name: string
  sortOrder: number
  items: QuoteLineItem[]
}

interface QuoteData {
  id: string
  quoteNumber: string
  title: string
  status: string
  currency: string
  validUntil: string | null
  terms: string | null
  notes: string | null
  paymentSchedule: { milestone: string; percent: number }[] | null
  totalCost: number | null
  totalQuoted: number | null
  sections: QuoteSection[]
}

interface EstimateData {
  id: string
  title: string
  currency: string
  sections: EstimateSection[]
}

interface Props {
  projectId: string
  projectSlug: string
  quote: QuoteData
  estimate: EstimateData
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

function itemEstimatedCost(item: EstimateItem): number {
  const hours = item.hours ?? 0
  const rate = item.costRate ?? 0
  const qty = item.quantity ?? 1
  if (hours > 0 && rate > 0) return hours * rate * qty
  if (rate > 0) return rate * qty
  return 0
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function QuoteGenerator({ projectId, projectSlug, quote, estimate }: Props) {
  const router = useRouter()

  const [sections, setSections] = useState<QuoteSection[]>(quote.sections)
  const [terms, setTerms] = useState(quote.terms ?? '')
  const [notes, setNotes] = useState(quote.notes ?? '')
  const [validUntil, setValidUntil] = useState(
    quote.validUntil ? quote.validUntil.slice(0, 10) : ''
  )
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currency = quote.currency

  const totalCost = sections.reduce((sum, s) =>
    sum + s.items.reduce((si, i) => si + (i.costBasis ?? 0), 0), 0
  )
  const totalQuoted = sections.reduce((sum, s) =>
    sum + s.items.filter(i => !i.isOptional).reduce((si, i) => si + i.unitPrice * i.quantity, 0), 0
  )
  const blendedMargin = totalCost > 0 ? ((totalQuoted - totalCost) / totalCost) * 100 : 0

  const updateMargin = useCallback((sectionId: string, itemId: string, marginPct: number) => {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      items: s.items.map(i => {
        if (i.id !== itemId) return i
        const cost = i.costBasis ?? 0
        const newPrice = cost > 0 ? cost * (1 + marginPct / 100) : i.unitPrice
        return { ...i, marginPercent: marginPct, unitPrice: Math.round(newPrice * 100) / 100 }
      }),
    }))
  }, [])

  const updateUnitPrice = useCallback((sectionId: string, itemId: string, price: number) => {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      items: s.items.map(i => {
        if (i.id !== itemId) return i
        const cost = i.costBasis ?? 0
        const newMargin = cost > 0 ? ((price - cost) / cost) * 100 : 0
        return { ...i, unitPrice: price, marginPercent: Math.round(newMargin * 100) / 100 }
      }),
    }))
  }, [])

  const updateDescription = useCallback((sectionId: string, itemId: string, desc: string) => {
    setSections(prev => prev.map(s =>
      s.id !== sectionId ? s : {
        ...s,
        items: s.items.map(i => i.id !== itemId ? i : { ...i, description: desc }),
      }
    ))
  }, [])

  const toggleOptional = useCallback((sectionId: string, itemId: string) => {
    setSections(prev => prev.map(s =>
      s.id !== sectionId ? s : {
        ...s,
        items: s.items.map(i => i.id !== itemId ? i : { ...i, isOptional: !i.isOptional }),
      }
    ))
  }, [])

  const toggleSectionExpand = useCallback((section: QuoteSection) => {
    const isExpanded = expandedSections[section.id]

    if (isExpanded) {
      // Collapse: merge all items back to one section-level line
      const totalCostBasis = section.items.reduce((sum, i) => sum + (i.costBasis ?? 0), 0)
      const totalPrice = section.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      const allSourceIds = section.items.flatMap(i => i.sourceItemIds)
      const hasOptional = section.items.some(i => i.isOptional)
      const blended = totalCostBasis > 0
        ? Math.round(((totalPrice - totalCostBasis) / totalCostBasis) * 10000) / 100
        : section.items[0]?.marginPercent ?? 0

      setSections(prev => prev.map(s => s.id !== section.id ? s : {
        ...s,
        items: [{
          id: crypto.randomUUID(),
          description: s.name,
          quantity: 1,
          unit: null,
          unitPrice: Math.round(totalPrice * 100) / 100,
          isOptional: false, // collapsed row is never optional
          hasEstimateLink: true,
          costBasis: totalCostBasis,
          marginPercent: blended,
          sourceItemIds: allSourceIds,
          sortOrder: 0,
        }],
      }))
      setExpandedSections(prev => ({ ...prev, [section.id]: false }))
    } else {
      // Expand: split to one line per source estimate item
      const estSection = estimate.sections.find(s =>
        s.items.some(ei => section.items[0]?.sourceItemIds.includes(ei.id))
      ) ?? estimate.sections.find(s => s.name === section.name)

      if (!estSection || estSection.items.length === 0) return

      const collapsedMargin = section.items[0]?.marginPercent ?? 0

      const expandedItems: QuoteLineItem[] = estSection.items.map((ei, idx) => {
        const cost = itemEstimatedCost(ei)
        const price = cost > 0 ? cost * (1 + collapsedMargin / 100) : 0
        return {
          id: crypto.randomUUID(),
          description: ei.description,
          quantity: 1,
          unit: ei.unit,
          unitPrice: Math.round(price * 100) / 100,
          isOptional: ei.isOptional,
          hasEstimateLink: true,
          costBasis: cost,
          marginPercent: collapsedMargin,
          sourceItemIds: [ei.id],
          sortOrder: idx,
        }
      })

      setSections(prev => prev.map(s => s.id !== section.id ? s : { ...s, items: expandedItems }))
      setExpandedSections(prev => ({ ...prev, [section.id]: true }))
    }
  }, [expandedSections, estimate.sections])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terms: terms || null,
          notes: notes || null,
          validUntil: validUntil || null,
          totalCost,
          totalQuoted,
          sections: sections.map((s, si) => ({
            name: s.name,
            sortOrder: si,
            items: s.items.map((i, ii) => ({
              description: i.description,
              quantity: i.quantity,
              unit: i.unit,
              unitPrice: i.unitPrice,
              isOptional: i.isOptional,
              hasEstimateLink: i.hasEstimateLink,
              sortOrder: ii,
              costBasis: i.costBasis,
              marginPercent: i.marginPercent,
              sourceItemIds: i.sourceItemIds,
            })),
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
      router.push(`/projects/${projectSlug}/quotes/${quote.id}`)
    } catch {
      setError('Failed to save quote')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-0 h-full border rounded-lg overflow-hidden">

      {/* ── Left: Estimate (read-only) ────────────────────────────────── */}
      <div className="flex flex-col bg-[#f8f7f4] border-r overflow-y-auto">
        <div className="sticky top-0 bg-[#f0ede6] border-b px-4 py-2.5 z-10">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#7a6f5e]">Internal estimate</p>
          <p className="text-xs text-[#9a8e7e] mt-0.5 truncate">{estimate.title}</p>
        </div>

        <div className="p-3 space-y-1.5">
          {estimate.sections.map(section => {
            const sectionCost = section.items.reduce((sum, i) => sum + itemEstimatedCost(i), 0)
            return (
              <div key={section.id} className="rounded border border-[#e5ddd0] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#ede9e1]">
                  <span className="text-xs font-semibold text-[#5a5040]">{section.name}</span>
                  <span className="text-xs text-[#8a7a6a]">{fmt(sectionCost, currency)}</span>
                </div>
                <div className="divide-y divide-[#ede9e1]">
                  {section.items.map(item => (
                    <div key={item.id} className="px-3 py-1">
                      <p className={cn('text-xs', item.isOptional ? 'text-[#9a8e7e] italic' : 'text-[#3a3028]')}>
                        {item.description}
                        {item.isOptional && <span className="ml-1 text-[10px] font-medium text-amber-600 not-italic">(opt)</span>}
                      </p>
                      <p className="text-[10px] text-[#9a8e7e] mt-0.5">
                        {item.hours ? `${item.hours}h · ` : ''}
                        {item.costRate ? `${fmt(Number(item.costRate), currency)}/unit · ` : ''}
                        cost: {fmt(itemEstimatedCost(item), currency)}
                        {item.tags.length > 0 ? ` · [${item.tags.join(', ')}]` : ''}
                      </p>
                      {item.internalNotes && (
                        <p className="text-[10px] text-[#b0a090] italic mt-0.5">{item.internalNotes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="text-xs font-medium text-[#7a6f5e] pt-2 border-t border-[#e5ddd0]">
            Total cost: {fmt(estimate.sections.reduce((sum, s) => sum + s.items.reduce((si, i) => si + itemEstimatedCost(i), 0), 0), currency)}
          </div>
        </div>
      </div>

      {/* ── Right: Quote (editable) ───────────────────────────────────── */}
      <div className="flex flex-col bg-background overflow-y-auto">
        <div className="sticky top-0 bg-background border-b px-4 py-2.5 z-10 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Quote {quote.quoteNumber}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Client-facing · {currency}</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
        </div>

        {error && (
          <div className="mx-3 mt-2 text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
        )}

        <div className="p-3 space-y-1.5">
          {sections.map(section => {
            const isExpanded = expandedSections[section.id]
            // In collapsed state, items has 1 non-optional row — use estimate to find optional info
            const estSection = estimate.sections.find(s =>
              s.items.some(ei => section.items[0]?.sourceItemIds.includes(ei.id))
            ) ?? estimate.sections.find(s => s.name === section.name)
            const estOptionalItems = estSection?.items.filter(i => i.isOptional) ?? []
            const estOptionalCost = estOptionalItems.reduce((sum, i) => sum + itemEstimatedCost(i), 0)

            // When expanded, use actual item flags
            const visibleItems = isExpanded ? section.items.filter(i => !i.isOptional) : section.items
            const optionalItems = isExpanded ? section.items.filter(i => i.isOptional) : []
            const sectionTotal = visibleItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
            const optionalTotal = isExpanded
              ? optionalItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
              : estOptionalCost // show cost estimate as a hint when collapsed

            return (
              <div key={section.id} className="rounded border overflow-hidden">
                {/* Section header row */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40">
                  <button
                    onClick={() => toggleSectionExpand(section)}
                    className="flex items-center gap-1 text-xs font-semibold hover:text-primary transition-colors"
                    title={isExpanded ? 'Collapse to section summary' : 'Expand to individual line items'}
                  >
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    }
                    {section.name}
                  </button>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">{fmt(sectionTotal, currency)}</span>
                    {estOptionalItems.length > 0 && !isExpanded && (
                      <span className="ml-1.5 text-[10px] text-amber-600">
                        {estOptionalItems.length} opt — expand to manage
                      </span>
                    )}
                    {optionalItems.length > 0 && isExpanded && (
                      <span className="ml-1.5 text-[10px] text-amber-600">
                        +{fmt(optionalTotal, currency)} opt
                      </span>
                    )}
                  </div>
                </div>

                {/* Collapsed: no item row — section header IS the line item */}
                {!isExpanded && (
                  <div className="px-3 py-1 border-t">
                    {/* Margin + price controls for the collapsed row */}
                    <div className="grid grid-cols-[1fr_72px_72px_56px] gap-2 items-center">
                      <div className="text-[10px] text-muted-foreground">
                        {estOptionalItems.length > 0 && (
                          <span className="text-amber-600">expand to control {estOptionalItems.length} optional item{estOptionalItems.length > 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground text-right">Margin%</div>
                      <div className="text-[10px] text-muted-foreground text-right">Price</div>
                      <div className="text-[10px] text-muted-foreground text-right">Total</div>
                    </div>
                    {section.items.slice(0, 1).map(item => (
                      <div key={item.id} className="grid grid-cols-[1fr_72px_72px_56px] gap-2 items-center mt-0.5">
                        <div />
                        <input
                          type="number"
                          value={item.marginPercent?.toString() ?? '0'}
                          onChange={e => updateMargin(section.id, item.id, parseFloat(e.target.value) || 0)}
                          className="text-xs text-right bg-muted/30 border rounded px-1.5 py-0.5 w-full"
                          step="1"
                        />
                        <input
                          type="number"
                          value={item.unitPrice.toString()}
                          onChange={e => updateUnitPrice(section.id, item.id, parseFloat(e.target.value) || 0)}
                          className="text-xs text-right bg-muted/30 border rounded px-1.5 py-0.5 w-full"
                          step="0.01"
                        />
                        <div className="text-xs text-right font-medium">
                          {fmt(item.unitPrice * item.quantity, currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expanded: one row per item */}
                {isExpanded && (
                  <>
                    <div className="grid grid-cols-[1fr_72px_72px_56px] gap-2 px-3 py-1 text-[10px] text-muted-foreground border-t bg-muted/10">
                      <span>Description</span>
                      <span className="text-right">Margin%</span>
                      <span className="text-right">Unit Price</span>
                      <span className="text-right">Total</span>
                    </div>
                    {section.items.map(item => (
                      <div
                        key={item.id}
                        className={cn(
                          'grid grid-cols-[1fr_72px_72px_56px] gap-2 px-3 py-1 items-start border-t last:border-b-0',
                          item.isOptional && 'bg-amber-50/50'
                        )}
                      >
                        <div className="min-w-0">
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateDescription(section.id, item.id, e.target.value)}
                            className="text-xs bg-transparent border-none outline-none w-full"
                          />
                          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer mt-0.5">
                            <input
                              type="checkbox"
                              checked={item.isOptional}
                              onChange={() => toggleOptional(section.id, item.id)}
                              className="rounded"
                            />
                            optional
                            {item.costBasis !== null && item.costBasis > 0 && (
                              <span className="ml-1 text-muted-foreground/60">· cost: {fmt(item.costBasis, currency)}</span>
                            )}
                          </label>
                        </div>
                        <input
                          type="number"
                          value={item.marginPercent?.toString() ?? '0'}
                          onChange={e => updateMargin(section.id, item.id, parseFloat(e.target.value) || 0)}
                          className="text-xs text-right bg-muted/30 border rounded px-1.5 py-0.5 w-full"
                          step="1"
                        />
                        <input
                          type="number"
                          value={item.unitPrice.toString()}
                          onChange={e => updateUnitPrice(section.id, item.id, parseFloat(e.target.value) || 0)}
                          className="text-xs text-right bg-muted/30 border rounded px-1.5 py-0.5 w-full"
                          step="0.01"
                        />
                        <div className={cn('text-xs text-right font-medium', item.isOptional && 'text-muted-foreground line-through')}>
                          {fmt(item.unitPrice * item.quantity, currency)}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          })}

          {/* Terms panel */}
          <div className="border rounded divide-y mt-2">
            <div className="px-3 py-1.5">
              <label className="text-[10px] text-muted-foreground block mb-0.5">Valid Until</label>
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                className="text-xs bg-transparent border-none outline-none"
              />
            </div>
            <div className="px-3 py-1.5">
              <label className="text-[10px] text-muted-foreground block mb-0.5">Client-facing notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Project overview, scope boundaries…"
                rows={2}
                className="text-xs w-full bg-transparent border-none outline-none resize-none"
              />
            </div>
            <div className="px-3 py-1.5">
              <label className="text-[10px] text-muted-foreground block mb-0.5">Terms &amp; conditions</label>
              <textarea
                value={terms}
                onChange={e => setTerms(e.target.value)}
                placeholder="Payment terms, revision limits, cancellation policy…"
                rows={3}
                className="text-xs w-full bg-transparent border-none outline-none resize-none"
              />
            </div>
          </div>

          {/* Totals bar */}
          <div className="border rounded px-4 py-2.5 bg-muted/20 mt-2">
            <div className="flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <div className="flex gap-4">
                  <span className="text-muted-foreground">Internal cost:</span>
                  <span>{fmt(totalCost, currency)}</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-muted-foreground">Blended margin:</span>
                  <span>{blendedMargin.toFixed(1)}%</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">Total quoted</div>
                <div className="text-lg font-semibold">{fmt(totalQuoted, currency)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

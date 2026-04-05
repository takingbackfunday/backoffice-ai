'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Save, Send } from 'lucide-react'
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

  // Editable state for each quote section/item
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

  // Total cost (from estimate)
  const totalCost = sections.reduce((sum, s) =>
    sum + s.items.reduce((si, i) => si + (i.costBasis ?? 0), 0), 0
  )

  // Total quoted (client-facing)
  const totalQuoted = sections.reduce((sum, s) =>
    sum + s.items
      .filter(i => !i.isOptional)
      .reduce((si, i) => si + i.unitPrice * i.quantity, 0),
    0
  )

  const blendedMargin = totalCost > 0 ? ((totalQuoted - totalCost) / totalCost) * 100 : 0

  // Update margin for a section item — recomputes unit price from cost basis
  const updateMargin = useCallback((sectionId: string, itemId: string, marginPct: number) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      return {
        ...s,
        items: s.items.map(i => {
          if (i.id !== itemId) return i
          const cost = i.costBasis ?? 0
          const newPrice = cost > 0 ? cost * (1 + marginPct / 100) : i.unitPrice
          return { ...i, marginPercent: marginPct, unitPrice: Math.round(newPrice * 100) / 100 }
        }),
      }
    }))
  }, [])

  const updateUnitPrice = useCallback((sectionId: string, itemId: string, price: number) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      return {
        ...s,
        items: s.items.map(i => {
          if (i.id !== itemId) return i
          const cost = i.costBasis ?? 0
          const newMargin = cost > 0 ? ((price - cost) / cost) * 100 : 0
          return { ...i, unitPrice: price, marginPercent: Math.round(newMargin * 100) / 100 }
        }),
      }
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
    <div className="grid grid-cols-2 gap-6 h-full">
      {/* Left: Estimate (read-only) */}
      <div className="space-y-4 overflow-y-auto">
        <div className="sticky top-0 bg-background pb-2 border-b">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Estimate (internal)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{estimate.title}</p>
        </div>
        {estimate.sections.map(section => {
          const sectionCost = section.items.reduce((sum, i) => sum + itemEstimatedCost(i), 0)
          return (
            <div key={section.id} className="border rounded-lg">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-t-lg">
                <span className="text-sm font-medium">{section.name}</span>
                <span className="text-xs text-muted-foreground">{fmt(sectionCost, currency)}</span>
              </div>
              <div className="divide-y">
                {section.items.map(item => (
                  <div key={item.id} className="px-3 py-2">
                    <p className={cn('text-xs', item.isOptional && 'text-muted-foreground italic')}>
                      {item.description}
                      {item.isOptional && ' (optional)'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.hours ? `${item.hours}h · ` : ''}
                      {item.costRate ? `${fmt(Number(item.costRate), currency)}/unit · ` : ''}
                      Cost: {fmt(itemEstimatedCost(item), currency)}
                      {item.tags.length > 0 ? ` · [${item.tags.join(', ')}]` : ''}
                    </p>
                    {item.internalNotes && (
                      <p className="text-xs text-muted-foreground/70 italic mt-0.5">{item.internalNotes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div className="text-sm font-medium text-muted-foreground pt-2 border-t">
          Total cost: {fmt(estimate.sections.reduce((sum, s) => sum + s.items.reduce((si, i) => si + itemEstimatedCost(i), 0), 0), currency)}
        </div>
      </div>

      {/* Right: Quote (editable) */}
      <div className="space-y-4 overflow-y-auto">
        <div className="sticky top-0 bg-background pb-2 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide">Quote {quote.quoteNumber}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Client-facing · {currency}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
        )}

        {/* Line items table */}
        {sections.map(section => {
          const isExpanded = expandedSections[section.id]
          return (
            <div key={section.id} className="border rounded-lg">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-t-lg">
                <button
                  onClick={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                  className="flex items-center gap-1 text-sm font-medium"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {section.name}
                </button>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_80px_80px_80px_60px] gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Margin%</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Total</span>
              </div>

              {section.items.map(item => (
                <div key={item.id} className={cn('grid grid-cols-[1fr_80px_80px_80px_60px] gap-2 px-3 py-2 items-center border-b last:border-b-0', item.isOptional && 'opacity-60')}>
                  <div className="min-w-0">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => updateDescription(section.id, item.id, e.target.value)}
                      className="text-sm bg-transparent border-none outline-none w-full"
                    />
                    <div className="flex items-center gap-2 mt-0.5">
                      <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isOptional}
                          onChange={() => toggleOptional(section.id, item.id)}
                          className="rounded"
                        />
                        optional
                      </label>
                      {item.costBasis !== null && item.costBasis > 0 && (
                        <span className="text-xs text-muted-foreground/60">cost: {fmt(item.costBasis, currency)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-right text-muted-foreground">{item.quantity}</div>
                  <input
                    type="number"
                    value={item.marginPercent?.toString() ?? '0'}
                    onChange={e => updateMargin(section.id, item.id, parseFloat(e.target.value) || 0)}
                    className="text-sm text-right bg-muted/30 border rounded px-2 py-0.5 w-full"
                    step="1"
                  />
                  <input
                    type="number"
                    value={item.unitPrice.toString()}
                    onChange={e => updateUnitPrice(section.id, item.id, parseFloat(e.target.value) || 0)}
                    className="text-sm text-right bg-muted/30 border rounded px-2 py-0.5 w-full"
                    step="0.01"
                  />
                  <div className="text-sm text-right font-medium">
                    {fmt(item.unitPrice * item.quantity, currency)}
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        {/* Terms panel */}
        <div className="border rounded-lg divide-y">
          <div className="px-3 py-2">
            <label className="text-xs text-muted-foreground block mb-1">Valid Until</label>
            <input
              type="date"
              value={validUntil}
              onChange={e => setValidUntil(e.target.value)}
              className="text-sm bg-transparent border-none outline-none"
            />
          </div>
          <div className="px-3 py-2">
            <label className="text-xs text-muted-foreground block mb-1">Client-facing notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Project overview, scope boundaries…"
              rows={2}
              className="text-sm w-full bg-transparent border-none outline-none resize-none"
            />
          </div>
          <div className="px-3 py-2">
            <label className="text-xs text-muted-foreground block mb-1">Terms &amp; conditions</label>
            <textarea
              value={terms}
              onChange={e => setTerms(e.target.value)}
              placeholder="Payment terms, revision limits, cancellation policy…"
              rows={3}
              className="text-sm w-full bg-transparent border-none outline-none resize-none"
            />
          </div>
        </div>

        {/* Totals bar */}
        <div className="border rounded-lg px-4 py-3 bg-muted/20">
          <div className="flex items-center justify-between text-sm">
            <div className="space-y-1">
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
              <div className="text-xs text-muted-foreground">Total quoted</div>
              <div className="text-xl font-semibold">{fmt(totalQuoted, currency)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

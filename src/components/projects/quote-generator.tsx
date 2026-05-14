'use client'

import { useState, useCallback, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Save, Plus, Trash2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Shared types                                                         */
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
  estimateIsShell: boolean
}

/* ------------------------------------------------------------------ */
/*  Build-mode types + reducer (inline estimate editor)                 */
/* ------------------------------------------------------------------ */

interface BuildItem {
  id: string
  description: string
  hours: string
  costRate: string
  quantity: string
  unit: string
  isOptional: boolean
}

interface BuildSection {
  id: string
  name: string
  items: BuildItem[]
}

type BuildAction =
  | { type: 'add_section' }
  | { type: 'remove_section'; sectionId: string }
  | { type: 'rename_section'; sectionId: string; name: string }
  | { type: 'add_item'; sectionId: string }
  | { type: 'remove_item'; sectionId: string; itemId: string }
  | { type: 'update_item'; sectionId: string; itemId: string; field: keyof BuildItem; value: string | boolean }

function newBuildItem(): BuildItem {
  return { id: crypto.randomUUID(), description: '', hours: '', costRate: '', quantity: '1', unit: 'hrs', isOptional: false }
}

function newBuildSection(): BuildSection {
  return { id: crypto.randomUUID(), name: 'New Section', items: [newBuildItem()] }
}

function buildReducer(state: BuildSection[], action: BuildAction): BuildSection[] {
  switch (action.type) {
    case 'add_section':
      return [...state, newBuildSection()]
    case 'remove_section':
      return state.filter(s => s.id !== action.sectionId)
    case 'rename_section':
      return state.map(s => s.id === action.sectionId ? { ...s, name: action.name } : s)
    case 'add_item':
      return state.map(s => s.id === action.sectionId ? { ...s, items: [...s.items, newBuildItem()] } : s)
    case 'remove_item':
      return state.map(s =>
        s.id === action.sectionId ? { ...s, items: s.items.filter(i => i.id !== action.itemId) } : s
      )
    case 'update_item':
      return state.map(s =>
        s.id === action.sectionId
          ? { ...s, items: s.items.map(i => i.id === action.itemId ? { ...i, [action.field]: action.value } : i) }
          : s
      )
    default:
      return state
  }
}

function buildItemCost(item: BuildItem): number {
  const hours = parseFloat(item.hours) || 0
  const rate = parseFloat(item.costRate) || 0
  const qty = parseFloat(item.quantity) || 1
  if (hours > 0 && rate > 0) return hours * rate * qty
  if (rate > 0) return rate * qty
  return 0
}

/* ------------------------------------------------------------------ */
/*  Review-mode helpers                                                  */
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

export function QuoteGenerator({ projectId, projectSlug, quote, estimate, estimateIsShell }: Props) {
  const router = useRouter()

  // ── Review mode state ──────────────────────────────────────────────
  const [sections, setSections] = useState<QuoteSection[]>(quote.sections)
  const [terms, setTerms] = useState(quote.terms ?? '')
  const [notes, setNotes] = useState(quote.notes ?? '')
  const [validUntil, setValidUntil] = useState(
    quote.validUntil ? quote.validUntil.slice(0, 10) : ''
  )
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      quote.sections.map(s => [
        s.id,
        s.items.length > 1 || (s.items.length === 1 && s.items[0].description !== s.name),
      ])
    )
  )
  const [saving, setSaving] = useState(false)

  // ── Build mode state ───────────────────────────────────────────────
  const [buildSections, dispatchBuild] = useReducer(
    buildReducer,
    estimate.sections,
    (sections): BuildSection[] => {
      if (!estimateIsShell || sections.length === 0) return [newBuildSection()]
      return sections.map(s => ({
        id: crypto.randomUUID(),
        name: s.name,
        items: s.items.length > 0
          ? s.items.map(i => ({
              id: crypto.randomUUID(),
              description: i.description,
              hours: i.hours?.toString() ?? '',
              costRate: i.costRate?.toString() ?? '',
              quantity: i.quantity.toString(),
              unit: i.unit ?? 'hrs',
              isOptional: i.isOptional,
            }))
          : [newBuildItem()],
      }))
    }
  )
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currency = quote.currency

  // ── Review mode derived ────────────────────────────────────────────
  const totalCost = sections.reduce((sum, s) =>
    sum + s.items.reduce((si, i) => si + (i.costBasis ?? 0), 0), 0
  )
  const totalQuoted = sections.reduce((sum, s) =>
    sum + s.items.filter(i => !i.isOptional).reduce((si, i) => si + i.unitPrice * i.quantity, 0), 0
  )
  const blendedMargin = totalCost > 0 ? ((totalQuoted - totalCost) / totalCost) * 100 : 0

  // Build mode derived
  const buildHasItems = buildSections.some(s => s.items.some(i => i.description.trim()))
  const buildTotalCost = buildSections.reduce((sum, s) =>
    sum + s.items.reduce((si, i) => si + buildItemCost(i), 0), 0
  )

  // ── Review mode handlers ───────────────────────────────────────────
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
      const includedItems = section.items.filter(i => !i.isOptional)
      const optionalSourceIds = section.items.filter(i => i.isOptional).flatMap(i => i.sourceItemIds)
      const allSourceIds = section.items.flatMap(i => i.sourceItemIds)

      const totalCostBasis = includedItems.reduce((sum, i) => sum + (i.costBasis ?? 0), 0)
      const totalPrice = includedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      const blended = totalCostBasis > 0
        ? Math.round(((totalPrice - totalCostBasis) / totalCostBasis) * 10000) / 100
        : includedItems[0]?.marginPercent ?? section.items[0]?.marginPercent ?? 0

      setSections(prev => prev.map(s => s.id !== section.id ? s : {
        ...s,
        items: [{
          id: crypto.randomUUID(),
          description: s.name,
          quantity: 1,
          unit: optionalSourceIds.length > 0 ? JSON.stringify({ optionalIds: optionalSourceIds }) : null,
          unitPrice: Math.round(totalPrice * 100) / 100,
          isOptional: false,
          hasEstimateLink: true,
          costBasis: totalCostBasis,
          marginPercent: blended,
          sourceItemIds: allSourceIds,
          sortOrder: 0,
        }],
      }))
      setExpandedSections(prev => ({ ...prev, [section.id]: false }))
    } else {
      const estSection = estimate.sections.find(s =>
        s.items.some(ei => section.items[0]?.sourceItemIds.includes(ei.id))
      ) ?? estimate.sections.find(s => s.name === section.name)

      if (!estSection || estSection.items.length === 0) return

      const collapsedItem = section.items[0]
      const collapsedMargin = collapsedItem?.marginPercent ?? 0

      let savedOptionalIds: string[] = []
      if (collapsedItem?.unit) {
        try {
          const parsed = JSON.parse(collapsedItem.unit) as { optionalIds?: string[] }
          savedOptionalIds = parsed.optionalIds ?? []
        } catch { /* not JSON */ }
      }

      const expandedItems: QuoteLineItem[] = estSection.items.map((ei, idx) => {
        const cost = itemEstimatedCost(ei)
        const price = cost > 0 ? cost * (1 + collapsedMargin / 100) : 0
        const isOptional = savedOptionalIds.length > 0
          ? savedOptionalIds.includes(ei.id)
          : ei.isOptional
        return {
          id: crypto.randomUUID(),
          description: ei.description,
          quantity: 1,
          unit: ei.unit,
          unitPrice: Math.round(price * 100) / 100,
          isOptional,
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

  // ── Build mode handler ─────────────────────────────────────────────
  async function handleGenerate() {
    if (!buildHasItems) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes/${quote.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: buildSections.map((s, si) => ({
            name: s.name,
            sortOrder: si,
            items: s.items
              .filter(i => i.description.trim())
              .map((item, ii) => ({
                description: item.description,
                hours: parseFloat(item.hours) || null,
                costRate: parseFloat(item.costRate) || null,
                quantity: parseFloat(item.quantity) || 1,
                unit: item.unit || null,
                isOptional: item.isOptional,
                sortOrder: ii,
              })),
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to generate quote'); return }
      router.refresh()
    } catch {
      setError('Failed to generate quote')
    } finally {
      setGenerating(false)
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Build mode UI                                                       */
  /* ------------------------------------------------------------------ */

  if (estimateIsShell) {
    return (
      <div className="grid grid-cols-2 gap-0 h-full border rounded-lg overflow-hidden">

        {/* ── Left: Inline estimate editor ────────────────────────────── */}
        <div className="flex flex-col bg-[#f8f7f4] border-r overflow-y-auto">
          <div className="sticky top-0 bg-[#f0ede6] border-b px-4 py-2.5 z-10 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#7a6f5e]">Build your scope</p>
              <p className="text-xs text-[#9a8e7e] mt-0.5">Internal estimate — costs never shown to client</p>
            </div>
            {buildTotalCost > 0 && (
              <span className="text-xs text-[#7a6f5e]">
                Total cost: {fmt(buildTotalCost, currency)}
              </span>
            )}
          </div>

          {error && (
            <div className="mx-3 mt-2 text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
          )}

          <div className="p-3 space-y-3 flex-1">
            {buildSections.map((section) => {
              const sectionCost = section.items.reduce((sum, i) => sum + buildItemCost(i), 0)
              return (
                <div key={section.id} className="rounded border border-[#e5ddd0] overflow-hidden">
                  {/* Section header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#ede9e1]">
                    <input
                      type="text"
                      value={section.name}
                      onChange={e => dispatchBuild({ type: 'rename_section', sectionId: section.id, name: e.target.value })}
                      className="flex-1 text-xs font-semibold bg-transparent border-none outline-none text-[#5a5040]"
                    />
                    {sectionCost > 0 && (
                      <span className="text-xs text-[#8a7a6a] shrink-0">{fmt(sectionCost, currency)}</span>
                    )}
                    {buildSections.length > 1 && (
                      <button
                        onClick={() => dispatchBuild({ type: 'remove_section', sectionId: section.id })}
                        className="text-[#9a8e7e] hover:text-destructive shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Items table — stripped: no Tags, no Risk */}
                  <table className="w-full text-xs border-collapse">
                    <colgroup>
                      <col />
                      <col className="w-12" />
                      <col className="w-16" />
                      <col className="w-10" />
                      <col className="w-12" />
                      <col className="w-5" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-[#e5ddd0]">
                        <th className="text-left px-3 py-1 text-[10px] font-normal text-[#9a8e7e]">Description</th>
                        <th className="text-right px-1 py-1 text-[10px] font-normal text-[#9a8e7e]">Hrs</th>
                        <th className="text-right px-1 py-1 text-[10px] font-normal text-[#9a8e7e]">Rate</th>
                        <th className="text-right px-1 py-1 text-[10px] font-normal text-[#9a8e7e]">Qty</th>
                        <th className="px-1 py-1 text-[10px] font-normal text-[#9a8e7e]">Unit</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((item) => {
                        const cost = buildItemCost(item)
                        return (
                          <tr key={item.id} className="border-b border-[#ede9e1] last:border-b-0 hover:bg-[#ede9e1]/40 group">
                            <td className="px-3 py-1.5 align-top">
                              <input
                                type="text"
                                value={item.description}
                                onChange={e => dispatchBuild({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'description', value: e.target.value })}
                                placeholder="Item description"
                                className="text-xs bg-transparent border-none outline-none w-full text-[#3a3028]"
                              />
                              <div className="flex items-center gap-2 mt-0.5">
                                <label className="flex items-center gap-1 text-[10px] text-[#9a8e7e] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={item.isOptional}
                                    onChange={e => dispatchBuild({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'isOptional', value: e.target.checked })}
                                    className="rounded"
                                  />
                                  optional
                                </label>
                                {cost > 0 && (
                                  <span className="text-[10px] text-[#9a8e7e]/60">{fmt(cost, currency)}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-1 py-1.5 align-top">
                              <input
                                type="number"
                                value={item.hours}
                                onChange={e => dispatchBuild({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'hours', value: e.target.value })}
                                placeholder="—"
                                className="text-xs text-right bg-transparent border-none outline-none w-full text-[#3a3028]"
                              />
                            </td>
                            <td className="px-1 py-1.5 align-top">
                              <input
                                type="number"
                                value={item.costRate}
                                onChange={e => dispatchBuild({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'costRate', value: e.target.value })}
                                placeholder="—"
                                className="text-xs text-right bg-transparent border-none outline-none w-full text-[#3a3028]"
                              />
                            </td>
                            <td className="px-1 py-1.5 align-top">
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={e => dispatchBuild({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'quantity', value: e.target.value })}
                                placeholder="1"
                                className="text-xs text-right bg-transparent border-none outline-none w-full text-[#3a3028]"
                              />
                            </td>
                            <td className="px-1 py-1.5 align-top">
                              <input
                                type="text"
                                value={item.unit}
                                onChange={e => dispatchBuild({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'unit', value: e.target.value })}
                                placeholder="hrs"
                                className="text-xs bg-transparent border-none outline-none w-full text-[#3a3028]"
                              />
                            </td>
                            <td className="px-1 py-1.5 align-top">
                              <button
                                onClick={() => dispatchBuild({ type: 'remove_item', sectionId: section.id, itemId: item.id })}
                                disabled={section.items.length === 1}
                                className="opacity-0 group-hover:opacity-100 text-[#9a8e7e] hover:text-destructive disabled:opacity-0 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={6} className="px-3 py-1.5">
                          <button
                            onClick={() => dispatchBuild({ type: 'add_item', sectionId: section.id })}
                            className="flex items-center gap-1 text-[10px] text-[#9a8e7e] hover:text-[#5a5040]"
                          >
                            <Plus className="w-3 h-3" /> Add item
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })}

            <button
              onClick={() => dispatchBuild({ type: 'add_section' })}
              className="flex items-center gap-1.5 text-xs text-[#9a8e7e] hover:text-[#5a5040] border border-dashed border-[#d5cdc0] rounded-lg px-3 py-2 w-full"
            >
              <Plus className="w-3.5 h-3.5" /> Add section
            </button>
          </div>
        </div>

        {/* ── Right: Quote placeholder ─────────────────────────────────── */}
        <div className="flex flex-col bg-background overflow-y-auto">
          <div className="sticky top-0 bg-background border-b px-4 py-2.5 z-10 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Quote {quote.quoteNumber}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Client-facing · {currency}</p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !buildHasItems}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? 'Generating…' : (
                <>Generate Quote <ArrowRight className="w-3 h-3" /></>
              )}
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-3">
              <ArrowRight className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {buildHasItems
                ? 'Ready to generate'
                : 'Build your scope on the left'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
              {buildHasItems
                ? 'Click Generate Quote to apply your margin rules and create pricing.'
                : 'Add sections and items, then click Generate Quote to create client pricing.'}
            </p>
            {buildHasItems && buildTotalCost > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Estimated cost: <span className="font-medium">{fmt(buildTotalCost, currency)}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /*  Review mode UI (existing flow)                                      */
  /* ------------------------------------------------------------------ */

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
            const estSection = estimate.sections.find(s =>
              s.items.some(ei => section.items[0]?.sourceItemIds.includes(ei.id))
            ) ?? estimate.sections.find(s => s.name === section.name)
            const estOptionalItems = estSection?.items.filter(i => i.isOptional) ?? []
            const estOptionalCost = estOptionalItems.reduce((sum, i) => sum + itemEstimatedCost(i), 0)

            const visibleItems = isExpanded ? section.items.filter(i => !i.isOptional) : section.items
            const optionalItems = isExpanded ? section.items.filter(i => i.isOptional) : []
            const sectionTotal = visibleItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
            const optionalTotal = isExpanded
              ? optionalItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
              : estOptionalCost

            return (
              <div key={section.id} className="rounded border overflow-hidden">
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

                {!isExpanded && (
                  <div className="px-3 py-1 border-t">
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

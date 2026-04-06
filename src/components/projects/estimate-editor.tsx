'use client'

import { useReducer, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Sparkles, ChevronDown, ChevronUp, Check, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface EstimateItemInput {
  id: string // client-only key
  description: string
  hours: string
  costRate: string
  quantity: string
  unit: string
  tags: string // comma-separated
  isOptional: boolean
  internalNotes: string
  riskLevel: string
}

export interface EstimateSectionInput {
  id: string // client-only key
  name: string
  items: EstimateItemInput[]
  collapsed: boolean
}

interface EstimateState {
  title: string
  currency: string
  notes: string
  sections: EstimateSectionInput[]
}

type EstimateAction =
  | { type: 'set_title'; value: string }
  | { type: 'set_currency'; value: string }
  | { type: 'set_notes'; value: string }
  | { type: 'add_section' }
  | { type: 'remove_section'; sectionId: string }
  | { type: 'update_section_name'; sectionId: string; name: string }
  | { type: 'toggle_section_collapse'; sectionId: string }
  | { type: 'add_item'; sectionId: string }
  | { type: 'remove_item'; sectionId: string; itemId: string }
  | { type: 'update_item'; sectionId: string; itemId: string; field: keyof EstimateItemInput; value: string | boolean }
  | { type: 'set_sections'; sections: EstimateSectionInput[] }

function newItem(): EstimateItemInput {
  return {
    id: crypto.randomUUID(),
    description: '',
    hours: '',
    costRate: '',
    quantity: '1',
    unit: 'hrs',
    tags: '',
    isOptional: false,
    internalNotes: '',
    riskLevel: 'low',
  }
}

function newSection(): EstimateSectionInput {
  return {
    id: crypto.randomUUID(),
    name: 'New Section',
    items: [newItem()],
    collapsed: false,
  }
}

function reducer(state: EstimateState, action: EstimateAction): EstimateState {
  switch (action.type) {
    case 'set_title': return { ...state, title: action.value }
    case 'set_currency': return { ...state, currency: action.value }
    case 'set_notes': return { ...state, notes: action.value }
    case 'add_section':
      return { ...state, sections: [...state.sections, newSection()] }
    case 'remove_section':
      return { ...state, sections: state.sections.filter(s => s.id !== action.sectionId) }
    case 'update_section_name':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId ? { ...s, name: action.name } : s
        ),
      }
    case 'toggle_section_collapse':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId ? { ...s, collapsed: !s.collapsed } : s
        ),
      }
    case 'add_item':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId ? { ...s, items: [...s.items, newItem()] } : s
        ),
      }
    case 'remove_item':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId
            ? { ...s, items: s.items.filter(i => i.id !== action.itemId) }
            : s
        ),
      }
    case 'update_item':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId
            ? {
                ...s,
                items: s.items.map(i =>
                  i.id === action.itemId ? { ...i, [action.field]: action.value } : i
                ),
              }
            : s
        ),
      }
    case 'set_sections':
      return { ...state, sections: action.sections }
    default:
      return state
  }
}

function itemCost(item: EstimateItemInput): number {
  const hours = parseFloat(item.hours) || 0
  const rate = parseFloat(item.costRate) || 0
  const qty = parseFloat(item.quantity) || 1
  if (hours > 0 && rate > 0) return hours * rate * qty
  if (rate > 0) return rate * qty
  return 0
}

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  projectId: string
  projectSlug: string
  clientName?: string
  billingType?: string
  existingEstimate?: {
    id: string
    title: string
    currency: string
    notes: string | null
    status: string
    version: number
    sections: {
      id: string
      name: string
      sortOrder: number
      items: {
        id: string
        description: string
        hours: number | null
        costRate: number | null
        quantity: number
        unit: string | null
        tags: string[]
        isOptional: boolean
        internalNotes: string | null
        riskLevel: string | null
        sortOrder: number
      }[]
    }[]
  }
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY']
const RISK_LEVELS = ['low', 'medium', 'high']

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function EstimateEditor({ projectId, projectSlug, clientName, billingType, existingEstimate }: Props) {
  const router = useRouter()

  const initialSections: EstimateSectionInput[] = existingEstimate?.sections.map(s => ({
    id: s.id,
    name: s.name,
    collapsed: false,
    items: s.items.map(i => ({
      id: i.id,
      description: i.description,
      hours: i.hours?.toString() ?? '',
      costRate: i.costRate?.toString() ?? '',
      quantity: i.quantity.toString(),
      unit: i.unit ?? 'hrs',
      tags: i.tags.join(', '),
      isOptional: i.isOptional,
      internalNotes: i.internalNotes ?? '',
      riskLevel: i.riskLevel ?? 'low',
    })),
  })) ?? [newSection()]

  const [state, dispatch] = useReducer(reducer, {
    title: existingEstimate?.title ?? '',
    currency: existingEstimate?.currency ?? 'USD',
    notes: existingEstimate?.notes ?? '',
    sections: initialSections,
  })

  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [revising, setRevising] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const [aiLoading, setAiLoading] = useState(false)

  const isFinalized = existingEstimate?.status === 'FINAL' || existingEstimate?.status === 'SUPERSEDED'

  const totalCost = state.sections.reduce((sum, s) =>
    sum + s.items.reduce((si, i) => si + itemCost(i), 0), 0
  )

  const toPayload = useCallback(() => ({
    title: state.title,
    currency: state.currency,
    notes: state.notes || null,
    sections: state.sections.map((s, si) => ({
      name: s.name,
      sortOrder: si,
      items: s.items.map((i, ii) => ({
        description: i.description,
        hours: parseFloat(i.hours) || null,
        costRate: parseFloat(i.costRate) || null,
        quantity: parseFloat(i.quantity) || 1,
        unit: i.unit || null,
        tags: i.tags.split(',').map(t => t.trim()).filter(Boolean),
        isOptional: i.isOptional,
        internalNotes: i.internalNotes || null,
        riskLevel: i.riskLevel || null,
        sortOrder: ii,
      })),
    })),
  }), [state])

  async function handleSave() {
    if (!state.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const url = existingEstimate
        ? `/api/projects/${projectId}/estimates/${existingEstimate.id}`
        : `/api/projects/${projectId}/estimates`
      const method = existingEstimate ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload()),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
      if (!existingEstimate) {
        router.push(`/projects/${projectSlug}/estimates/${json.data.id}`)
      }
    } catch {
      setError('Failed to save estimate')
    } finally {
      setSaving(false)
    }
  }

  async function handleFinalize() {
    if (!existingEstimate) return
    setFinalizing(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/estimates/${existingEstimate.id}/finalize`,
        { method: 'POST' }
      )
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to finalize'); return }
      router.refresh()
    } catch {
      setError('Failed to finalize estimate')
    } finally {
      setFinalizing(false)
    }
  }

  async function handleRevise() {
    if (!existingEstimate) return
    setRevising(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/estimates/${existingEstimate.id}/revise`,
        { method: 'POST' }
      )
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create revision'); return }
      router.push(`/projects/${projectSlug}/estimates/${json.data.id}`)
    } catch {
      setError('Failed to create revision')
    } finally {
      setRevising(false)
    }
  }

  async function handleAiSend() {
    if (!aiInput.trim() || aiLoading) return
    const userMsg = { role: 'user' as const, text: aiInput }
    setAiMessages(prev => [...prev, userMsg])
    setAiInput('')
    setAiLoading(true)
    try {
      const estId = existingEstimate?.id ?? 'new'
      const res = await fetch(
        `/api/projects/${projectId}/estimates/${estId}/ai-assist`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...aiMessages.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: aiInput }],
            currentEstimate: {
              title: state.title,
              currency: state.currency,
              sections: state.sections.map(s => ({
                name: s.name,
                items: s.items.map(i => ({
                  description: i.description,
                  hours: parseFloat(i.hours) || null,
                  costRate: parseFloat(i.costRate) || null,
                  quantity: parseFloat(i.quantity) || 1,
                  unit: i.unit || null,
                  tags: i.tags.split(',').map(t => t.trim()).filter(Boolean),
                  isOptional: i.isOptional,
                  riskLevel: i.riskLevel,
                })),
              })),
            },
            clientName,
            billingType,
          }),
        }
      )
      const json = await res.json()
      const result = json.data as { text: string; actions: AiActionDef[] }
      setAiMessages(prev => [...prev, { role: 'assistant', text: result.text || 'Done.' }])

      const toItems = (items: AiItem[]) => (items ?? []).map((i: AiItem) => ({
        id: crypto.randomUUID(),
        description: i.description ?? '',
        hours: i.hours?.toString() ?? '',
        costRate: i.costRate?.toString() ?? '',
        quantity: (i.quantity ?? 1).toString(),
        unit: i.unit ?? 'hrs',
        tags: (i.tags ?? []).join(', '),
        isOptional: i.isOptional ?? false,
        internalNotes: i.internalNotes ?? '',
        riskLevel: i.riskLevel ?? 'low',
      }))

      for (const action of (result.actions ?? [])) {
        if (action.type === 'set_sections' && action.sections) {
          dispatch({
            type: 'set_sections',
            sections: action.sections.map((s: AiSection) => ({
              id: crypto.randomUUID(),
              name: s.name,
              collapsed: false,
              items: toItems(s.items ?? []),
            })),
          })
        } else if (action.type === 'add_section' && action.name) {
          dispatch({
            type: 'set_sections',
            sections: [
              ...state.sections,
              {
                id: crypto.randomUUID(),
                name: action.name,
                collapsed: false,
                items: action.items ? toItems(action.items) : [newItem()],
              },
            ],
          })
        } else if (action.type === 'add_items' && action.sectionName && action.items) {
          // Find the matching section by name (case-insensitive)
          const targetSection = state.sections.find(
            s => s.name.toLowerCase() === (action.sectionName as string).toLowerCase()
          )
          if (targetSection) {
            dispatch({
              type: 'set_sections',
              sections: state.sections.map(s =>
                s.id === targetSection.id
                  ? { ...s, items: [...s.items, ...toItems(action.items as AiItem[])] }
                  : s
              ),
            })
          }
        } else if (action.type === 'set_title' && action.title) {
          dispatch({ type: 'set_title', value: action.title })
        } else if (action.type === 'set_notes' && action.notes) {
          dispatch({ type: 'set_notes', value: action.notes })
        }
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I had trouble processing that.' }])
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-4">
          <input
            type="text"
            value={state.title}
            onChange={e => dispatch({ type: 'set_title', value: e.target.value })}
            placeholder="Estimate title"
            disabled={isFinalized}
            className="text-2xl font-semibold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={state.currency}
            onChange={e => dispatch({ type: 'set_currency', value: e.target.value })}
            disabled={isFinalized}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={() => setAiOpen(prev => !prev)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Assist
          </button>
          {!isFinalized && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm px-3 py-1.5 rounded border hover:bg-accent disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {existingEstimate && (
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="flex items-center gap-1 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {finalizing ? 'Finalizing…' : 'Finalize'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isFinalized && (
        <div className="flex items-center justify-between gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {existingEstimate?.status === 'SUPERSEDED'
              ? 'This estimate has been superseded by a newer version.'
              : 'This estimate is finalized. Create a revision to make changes.'}
          </div>
          {existingEstimate?.status === 'FINAL' && (
            <button
              onClick={handleRevise}
              disabled={revising}
              className="shrink-0 text-xs px-2.5 py-1 rounded border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-700 disabled:opacity-50"
            >
              {revising ? 'Creating…' : 'Create Revision'}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      {/* AI Assist panel */}
      {aiOpen && (
        <div className="border rounded-lg p-4 space-y-3 bg-accent/20">
          <p className="text-sm font-medium">AI Estimation Assistant</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {aiMessages.map((m, i) => (
              <div key={i} className={cn('text-sm rounded px-3 py-2', m.role === 'user' ? 'bg-primary/10 ml-8' : 'bg-background mr-8')}>
                {m.text}
              </div>
            ))}
            {aiLoading && <div className="text-sm text-muted-foreground px-3">Thinking…</div>}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend() } }}
              placeholder="Describe the project scope…"
              className="flex-1 text-sm border rounded px-3 py-1.5 bg-background"
            />
            <button
              onClick={handleAiSend}
              disabled={aiLoading || !aiInput.trim()}
              className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {state.sections.map((section, si) => (
          <div key={section.id} className="border rounded-lg">
            {/* Section header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 rounded-t-lg">
              <button
                onClick={() => dispatch({ type: 'toggle_section_collapse', sectionId: section.id })}
                className="text-muted-foreground hover:text-foreground"
              >
                {section.collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={section.name}
                onChange={e => dispatch({ type: 'update_section_name', sectionId: section.id, name: e.target.value })}
                disabled={isFinalized}
                className="flex-1 text-sm font-medium bg-transparent border-none outline-none"
              />
              <span className="text-xs text-muted-foreground">
                {section.items.length} item{section.items.length !== 1 ? 's' : ''} ·{' '}
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: state.currency }).format(
                  section.items.reduce((sum, i) => sum + itemCost(i), 0)
                )}
              </span>
              {!isFinalized && state.sections.length > 1 && (
                <button
                  onClick={() => dispatch({ type: 'remove_section', sectionId: section.id })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Items */}
            {!section.collapsed && (
              <div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_56px_72px_56px_56px_96px_auto_20px] gap-x-2 px-4 py-1 text-xs text-muted-foreground border-b items-start">
                  <span>Description</span>
                  <span className="text-right">Hrs</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Qty</span>
                  <span>Unit</span>
                  <span>Tags</span>
                  <span>Risk / Opts</span>
                  <span />
                </div>
                {section.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_56px_72px_56px_56px_96px_auto_20px] gap-x-2 items-center px-4 py-1.5 border-b last:border-b-0 hover:bg-muted/20 group">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <input
                        type="text"
                        value={item.description}
                        onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'description', value: e.target.value })}
                        placeholder="Item description"
                        disabled={isFinalized}
                        className="text-sm bg-transparent border-none outline-none w-full"
                      />
                      {!isFinalized && (
                        <input
                          type="text"
                          value={item.internalNotes}
                          onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'internalNotes', value: e.target.value })}
                          placeholder="Internal notes…"
                          className="text-xs text-muted-foreground bg-transparent border-none outline-none w-full italic"
                        />
                      )}
                    </div>
                    <input
                      type="number"
                      value={item.hours}
                      onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'hours', value: e.target.value })}
                      placeholder="—"
                      disabled={isFinalized}
                      className="text-sm text-right bg-transparent border-none outline-none w-full"
                    />
                    <input
                      type="number"
                      value={item.costRate}
                      onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'costRate', value: e.target.value })}
                      placeholder="—"
                      disabled={isFinalized}
                      className="text-sm text-right bg-transparent border-none outline-none w-full"
                    />
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'quantity', value: e.target.value })}
                      placeholder="1"
                      disabled={isFinalized}
                      className="text-sm text-right bg-transparent border-none outline-none w-full"
                    />
                    <input
                      type="text"
                      value={item.unit}
                      onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'unit', value: e.target.value })}
                      placeholder="hrs"
                      disabled={isFinalized}
                      className="text-sm bg-transparent border-none outline-none w-full"
                    />
                    <input
                      type="text"
                      value={item.tags}
                      onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'tags', value: e.target.value })}
                      placeholder="dev, design"
                      disabled={isFinalized}
                      className="text-sm bg-transparent border-none outline-none w-full text-muted-foreground"
                    />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                      <select
                        value={item.riskLevel}
                        onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'riskLevel', value: e.target.value })}
                        disabled={isFinalized}
                        className="bg-transparent text-xs"
                      >
                        {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isOptional}
                          onChange={e => dispatch({ type: 'update_item', sectionId: section.id, itemId: item.id, field: 'isOptional', value: e.target.checked })}
                          disabled={isFinalized}
                          className="rounded"
                        />
                        opt
                      </label>
                      <span className="text-muted-foreground/60">{new Intl.NumberFormat('en-US', { style: 'currency', currency: state.currency, maximumFractionDigits: 0 }).format(itemCost(item))}</span>
                    </div>
                    {!isFinalized ? (
                      <button
                        onClick={() => dispatch({ type: 'remove_item', sectionId: section.id, itemId: item.id })}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        disabled={section.items.length === 1}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : <span />}
                  </div>
                ))}
                {!isFinalized && (
                  <div className="px-4 py-1.5">
                    <button
                      onClick={() => dispatch({ type: 'add_item', sectionId: section.id })}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3 h-3" /> Add item
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {!isFinalized && (
          <button
            onClick={() => dispatch({ type: 'add_section' })}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-4 py-3 w-full"
          >
            <Plus className="w-4 h-4" /> Add section
          </button>
        )}
      </div>

      {/* Notes */}
      {!isFinalized && (
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide">Internal notes</label>
          <textarea
            value={state.notes}
            onChange={e => dispatch({ type: 'set_notes', value: e.target.value })}
            placeholder="Risk assessments, assumptions, dependencies…"
            rows={3}
            className="mt-1 w-full text-sm border rounded p-2 bg-background resize-none"
          />
        </div>
      )}

      {/* Footer totals */}
      <div className="flex items-center justify-between text-sm border-t pt-4">
        <span className="text-muted-foreground">{state.sections.reduce((sum, s) => sum + s.items.length, 0)} items across {state.sections.length} sections</span>
        <span className="font-medium">
          Total cost: {new Intl.NumberFormat('en-US', { style: 'currency', currency: state.currency }).format(totalCost)}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  AI action types (internal)                                          */
/* ------------------------------------------------------------------ */

interface AiSection { name: string; items?: AiItem[] }
interface AiItem {
  description?: string
  hours?: number
  costRate?: number
  quantity?: number
  unit?: string
  tags?: string[]
  isOptional?: boolean
  internalNotes?: string
  riskLevel?: string
}

interface AiActionDef {
  type: string
  sections?: AiSection[]
  name?: string
  items?: AiItem[]
  sectionName?: string
  title?: string
  notes?: string
  question?: string
}

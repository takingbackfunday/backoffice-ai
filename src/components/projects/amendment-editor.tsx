'use client'

import { useState, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2 } from 'lucide-react'

interface AmendmentItem {
  id: string
  description: string
  quantity: string
  unit: string
  unitPrice: string
  isOptional: boolean
}

interface AmendmentState {
  sections: { id: string; name: string; items: AmendmentItem[] }[]
}

type Action =
  | { type: 'ADD_ITEM'; sectionId: string }
  | { type: 'REMOVE_ITEM'; sectionId: string; itemId: string }
  | { type: 'UPDATE_ITEM'; sectionId: string; itemId: string; field: string; value: string | boolean }

function newItem(): AmendmentItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: '1',
    unit: 'x',
    unitPrice: '',
    isOptional: false,
  }
}

function reducer(state: AmendmentState, action: Action): AmendmentState {
  switch (action.type) {
    case 'ADD_ITEM':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId
            ? { ...s, items: [...s.items, newItem()] }
            : s,
        ),
      }
    case 'REMOVE_ITEM':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId
            ? { ...s, items: s.items.filter(i => i.id !== action.itemId) }
            : s,
        ),
      }
    case 'UPDATE_ITEM':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId
            ? {
                ...s,
                items: s.items.map(i =>
                  i.id === action.itemId ? { ...i, [action.field]: action.value } : i,
                ),
              }
            : s,
        ),
      }
    default:
      return state
  }
}

interface Props {
  projectId: string
  projectSlug: string
  quoteId: string
  currency: string
  originalTotal: number
}

export function AmendmentEditor({ projectId, projectSlug, quoteId, currency, originalTotal }: Props) {
  const router = useRouter()
  const sectionId = 'change-order-section'

  const [state, dispatch] = useReducer(reducer, {
    sections: [{ id: sectionId, name: 'Change order', items: [newItem()] }],
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const section = state.sections[0]
  const amendmentTotal = section.items.reduce(
    (sum, i) => sum + (parseFloat(i.unitPrice) || 0) * (parseFloat(i.quantity) || 1),
    0,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const filledItems = section.items.filter(i => i.description.trim())
    if (filledItems.length === 0) { setError('At least one item with a description is required'); return }

    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        sections: state.sections.map((s, si) => ({
          name: s.name,
          sortOrder: si,
          items: filledItems.map((i, ii) => ({
            description: i.description,
            quantity: parseFloat(i.quantity) || 1,
            unit: i.unit || null,
            unitPrice: parseFloat(i.unitPrice) || 0,
            isOptional: i.isOptional,
            sortOrder: ii,
          })),
        })),
      }

      const res = await fetch(`/api/projects/${projectId}/quotes/${quoteId}/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create amendment'); return }

      router.push(`/projects/${projectSlug}/quotes/${json.data.id}`)
    } catch {
      setError('Failed to create amendment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Original quote total: {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(originalTotal)}
      </p>

      {/* Section header */}
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/30">
          <input
            type="text"
            value={section.name}
            readOnly
            className="flex-1 text-sm font-medium bg-transparent border-none outline-none"
          />
          <span className="text-xs text-muted-foreground">
            {section.items.length} item{section.items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Items */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left px-4 py-1.5 text-xs font-normal text-muted-foreground">Description</th>
              <th className="px-1 py-1.5 text-xs font-normal text-muted-foreground text-right">Qty</th>
              <th className="px-1 py-1.5 text-xs font-normal text-muted-foreground text-right">Price</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {section.items.map(item => (
              <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/20 group">
                <td className="px-4 py-1.5">
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => dispatch({ type: 'UPDATE_ITEM', sectionId: section.id, itemId: item.id, field: 'description', value: e.target.value })}
                    placeholder="Change description"
                    className="text-sm bg-transparent border-none outline-none w-full"
                  />
                </td>
                <td className="px-1 py-1.5">
                  <div className="flex items-center gap-1 justify-end">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => dispatch({ type: 'UPDATE_ITEM', sectionId: section.id, itemId: item.id, field: 'quantity', value: e.target.value })}
                      placeholder="1"
                      className="text-sm text-right bg-transparent border-none outline-none w-10"
                      step="1"
                    />
                    <input
                      type="text"
                      value={item.unit}
                      onChange={e => dispatch({ type: 'UPDATE_ITEM', sectionId: section.id, itemId: item.id, field: 'unit', value: e.target.value })}
                      placeholder="x"
                      className="text-sm bg-transparent border-none outline-none w-8 text-muted-foreground"
                    />
                  </div>
                </td>
                <td className="px-1 py-1.5">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={e => dispatch({ type: 'UPDATE_ITEM', sectionId: section.id, itemId: item.id, field: 'unitPrice', value: e.target.value })}
                    placeholder="0"
                    className="text-sm text-right bg-transparent border-none outline-none w-full"
                    step="0.01"
                  />
                </td>
                <td className="px-1 py-1.5">
                  <button
                    type="button"
                    onClick={() => section.items.length > 1 && dispatch({ type: 'REMOVE_ITEM', sectionId: section.id, itemId: item.id })}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    disabled={section.items.length === 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="px-4 py-2 border-t">
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_ITEM', sectionId: section.id })}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3 h-3" /> Add item
          </button>
        </div>
      </div>

      {/* Amendment total */}
      <div className="border rounded-lg px-4 py-3 bg-muted/20">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Amendment total</span>
          <span className="font-semibold">
            {amendmentTotal > 0
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amendmentTotal)
              : '—'}
          </span>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 px-4 py-2 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {submitting ? 'Creating…' : 'Create Change Order'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded border text-sm hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

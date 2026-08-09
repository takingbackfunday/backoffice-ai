'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X, Plus } from 'lucide-react'

interface QuoteLineItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  isOptional: boolean
}

interface QuoteSection {
  id: string
  name: string
  items: QuoteLineItem[]
}

interface Props {
  quoteId: string
  projectSlug: string
  sections: QuoteSection[]
  currency: string
  onClose?: () => void
}

export function CreateInvoicePanel({ quoteId, projectSlug, sections, currency, onClose }: Props) {
  const router = useRouter()
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [notes, setNotes] = useState('')
  const [milestoneMode, setMilestoneMode] = useState(false)
  const [milestoneLabel, setMilestoneLabel] = useState('')
  const [milestonePercent, setMilestonePercent] = useState('')
  const [checkedOptional, setCheckedOptional] = useState<Set<string>>(() =>
    new Set(sections.flatMap(s => s.items.filter(i => i.isOptional).map(i => i.id)))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allItems = useMemo(() => sections.flatMap(s => s.items), [sections])
  const nonOptionalIds = useMemo(() => allItems.filter(i => !i.isOptional).map(i => i.id), [allItems])
  const optionalItems = useMemo(() => allItems.filter(i => i.isOptional), [allItems])

  const invoiceTotal = useMemo(() => {
    const selected = allItems.filter(i => !i.isOptional || checkedOptional.has(i.id))
    return selected.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  }, [allItems, checkedOptional])

  const optionalSelectedTotal = useMemo(() => {
    return optionalItems
      .filter(i => checkedOptional.has(i.id))
      .reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  }, [optionalItems, checkedOptional])

  function toggleOptional(id: string) {
    setCheckedOptional(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (!dueDate) { setError('Due date is required'); return }
    if (milestoneMode) {
      if (!milestoneLabel.trim()) { setError('Milestone label is required'); return }
      const pct = parseInt(milestonePercent, 10)
      if (isNaN(pct) || pct < 1 || pct > 100) { setError('Milestone percent must be between 1 and 100'); return }
    }

    setSubmitting(true)
    setError(null)
    try {
      const includeItemIds = [
        ...nonOptionalIds,
        ...Array.from(checkedOptional),
      ]

      const body: Record<string, unknown> = {
        dueDate,
        notes: notes.trim() || null,
        includeItemIds,
      }
      if (milestoneMode) {
        body.milestoneLabel = milestoneLabel.trim()
        body.milestonePercent = parseInt(milestonePercent, 10)
      }

      const res = await fetch(`/api/projects/${projectSlug}/quotes/${quoteId}/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create invoice'); return }

      router.push(`/projects/${projectSlug}/invoices/${json.data.id}`)
    } catch {
      setError('Failed to create invoice')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Create Invoice from Quote</p>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Due date */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 bg-background"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Notes <span className="text-muted-foreground/60">(optional)</span></label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Additional notes for the invoice…"
            rows={2}
            className="w-full text-sm border rounded px-2 py-1.5 bg-background resize-none"
          />
        </div>
      </div>

      {/* Optional items checklist */}
      {optionalItems.length > 0 && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Optional items to include</label>
          <div className="space-y-1">
            {optionalItems.map(item => (
              <label
                key={item.id}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/30 rounded px-2 py-1"
              >
                <input
                  type="checkbox"
                  checked={checkedOptional.has(item.id)}
                  onChange={() => toggleOptional(item.id)}
                  className="rounded"
                />
                <span>{item.description}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(item.unitPrice * item.quantity)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Total preview */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between text-sm">
          <div className="space-y-0.5">
            {optionalItems.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Optional included: <span className="font-medium">{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(optionalSelectedTotal)}</span>
                {optionalItems.length > 0 && optionalSelectedTotal < optionalItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0) && (
                  <span className="text-muted-foreground/60"> (deselected: {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(optionalItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0) - optionalSelectedTotal)})</span>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Invoice total</div>
            <div className="text-lg font-semibold tabular-nums">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(invoiceTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Milestone mode */}
      <div className="border-t pt-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={milestoneMode}
            onChange={e => setMilestoneMode(e.target.checked)}
            className="rounded"
          />
          <span className="font-medium">Milestone payment</span>
          <span className="text-xs text-muted-foreground">(invoice a partial amount)</span>
        </label>

        {milestoneMode && (
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Milestone</label>
              <input
                type="text"
                value={milestoneLabel}
                onChange={e => setMilestoneLabel(e.target.value)}
                placeholder="e.g. 50% deposit"
                className="w-full text-sm border rounded px-2 py-1.5 bg-background"
              />
            </div>
            <div className="w-24">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Percent</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={milestonePercent}
                  onChange={e => setMilestonePercent(e.target.value)}
                  placeholder="50"
                  min="1"
                  max="100"
                  className="w-16 text-sm border rounded px-2 py-1.5 bg-background text-right"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-1.5 px-4 py-2 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {submitting ? 'Creating…' : 'Create Invoice'}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Sparkles, Save, Download, Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuoteForm, type QuoteFormState, type ItemInput } from './hooks/use-quote-form'
import { QuoteLineItemsTable } from './quote-line-items-table'
import { AiConfirmBanner } from '@/components/projects/ai-confirm-banner'
import { useChatStore } from '@/stores/chat-store'
import { SaveTemplateModal } from './save-template-modal'
import { ServiceItemPicker } from './service-item-picker'
import { useSaveToLibrary } from './hooks/use-save-to-library'

interface Props {
  initialData: {
    id?: string
    quoteNumber?: string
    title: string
    currency: string
    notes: string | null
    terms: string | null
    validUntil: string | null
    status?: string
    sections: {
      id: string
      name: string
      items: {
        id: string
        description: string
        quantity: number
        unit: string | null
        unitPrice: number
        costRate: number | null
        tags: string[]
        internalNotes: string | null
        riskLevel: string | null
        priceManual: boolean
        isOptional: boolean
      }[]
    }[]
  }
  marginRules: { tag: string; marginPct: number }[]
  projectSlug: string
  clientName?: string
  jobName?: string
  onSave: (payload: Record<string, unknown>) => Promise<void>
  onSaveAndDownload?: (payload: Record<string, unknown>) => Promise<void>
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY']

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

function buildInitialState(data: Props['initialData']): QuoteFormState {
  return {
    title: data.title,
    currency: data.currency,
    notes: data.notes ?? '',
    terms: data.terms ?? '',
    validUntil: data.validUntil ? data.validUntil.slice(0, 10) : '',
    sections: data.sections.map(s => ({
      id: s.id,
      name: s.name,
      items: s.items.map(i => ({
        id: i.id,
        description: i.description,
        quantity: String(i.quantity),
        unit: i.unit ?? 'x',
        unitPrice: String(i.unitPrice),
        costRate: i.costRate != null ? String(i.costRate) : '',
        tags: i.tags.join(', '),
        internalNotes: i.internalNotes ?? '',
        riskLevel: i.riskLevel ?? 'low',
        priceManual: i.priceManual,
        isOptional: i.isOptional,
      })),
    })),
  }
}

export function QuoteEditor({ initialData, marginRules, projectSlug, clientName, jobName, onSave, onSaveAndDownload }: Props) {
  const [showCosts, setShowCosts] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('quote-editor-show-costs') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('quote-editor-show-costs', String(showCosts))
  }, [showCosts])

  const initialState = buildInitialState(initialData)

  const {
    state,
    dispatch,
    pendingFields,
    hasPendingChanges,
    confirm,
    undo,
    totals,
    blendedMargin,
    buildPayload,
  } = useQuoteForm(
    initialState,
    marginRules,
    initialData.id,
    initialData.quoteNumber,
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const { save: saveToLibrary, statuses: libraryStatuses } = useSaveToLibrary()

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(buildPayload() as unknown as Record<string, unknown>)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [onSave, buildPayload])

  const handleSaveAndDownload = useCallback(async () => {
    if (!onSaveAndDownload) return
    setSaving(true)
    setError(null)
    try {
      await onSaveAndDownload(buildPayload() as unknown as Record<string, unknown>)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save and download')
    } finally {
      setSaving(false)
    }
  }, [onSaveAndDownload, buildPayload])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={cn(pendingFields.has('title') && 'ai-changed p-1 rounded-lg')}>
        <input
          type="text"
          value={state.title}
          onChange={e => dispatch({ type: 'SET_TITLE', value: e.target.value })}
          placeholder="Quote title"
          className="text-2xl font-semibold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <select
          value={state.currency}
          onChange={e => dispatch({ type: 'SET_CURRENCY', value: e.target.value })}
          className={cn('text-sm border rounded px-2 py-1 bg-background', pendingFields.has('currency') && 'ai-changed')}
        >
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showCosts}
            onChange={e => setShowCosts(e.target.checked)}
            className="rounded"
          />
          Show costs
        </label>
        <button
          onClick={() => useChatStore.getState().toggle()}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask AI
        </button>
        <button
          onClick={() => setTemplateModalOpen(true)}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent"
        >
          <Bookmark className="w-3.5 h-3.5" /> Save as template
        </button>
        {onSaveAndDownload && (
          <button
            onClick={handleSaveAndDownload}
            disabled={saving}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save & Download'}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {(clientName || jobName) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {clientName && <span className="bg-muted/40 rounded px-2 py-0.5">Client: {clientName}</span>}
          {jobName && <span className="bg-muted/40 rounded px-2 py-0.5">Job: {jobName}</span>}
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      <SaveTemplateModal open={templateModalOpen} onOpenChange={setTemplateModalOpen} sections={state.sections} />

      {/* AI confirm banner */}
      {hasPendingChanges && (
        <AiConfirmBanner
          onConfirm={confirm}
          onUndo={() => undo((snapshot: QuoteFormState) => {
            dispatch({ type: 'SET_TITLE', value: snapshot.title })
            dispatch({ type: 'SET_CURRENCY', value: snapshot.currency })
            dispatch({ type: 'SET_NOTES', value: snapshot.notes })
            dispatch({ type: 'SET_TERMS', value: snapshot.terms })
            dispatch({ type: 'SET_VALID_UNTIL', value: snapshot.validUntil })
            dispatch({ type: 'SET_SECTIONS', sections: snapshot.sections })
          })}
        />
      )}

      {/* Sections */}
      <div className={cn('space-y-4', pendingFields.has('sections') && 'ai-changed rounded-lg p-1')}>
        {state.sections.map((section) => (
          <div key={section.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/30">
              <input
                type="text"
                value={section.name}
                onChange={e => dispatch({ type: 'RENAME_SECTION', sectionId: section.id, name: e.target.value })}
                className="flex-1 text-sm font-medium bg-transparent border-none outline-none"
              />
              <span className="text-xs text-muted-foreground">
                {section.items.length} item{section.items.length !== 1 ? 's' : ''}
              </span>
              {state.sections.length > 1 && (
                <button
                  onClick={() => dispatch({ type: 'REMOVE_SECTION', sectionId: section.id })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <QuoteLineItemsTable
              section={section}
              marginRules={marginRules}
              showCosts={showCosts}
              libraryStatus={libraryStatuses}
              onUpdateItem={(itemId, field, value) =>
                dispatch({ type: 'UPDATE_ITEM', sectionId: section.id, itemId, field: field as keyof ItemInput, value: value as string | boolean })
              }
              onRemoveItem={(itemId) =>
                dispatch({ type: 'REMOVE_ITEM', sectionId: section.id, itemId })
              }
              onSaveToLibrary={saveToLibrary}
            />
            <div className="px-4 py-2 border-t">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => dispatch({ type: 'ADD_ITEM', sectionId: section.id })}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3 h-3" /> Add item
                </button>
                <ServiceItemPicker onSelect={(item) => dispatch({
                  type: 'ADD_ITEM', sectionId: section.id,
                  payload: {
                    description: item.description,
                    unit: item.unit ?? 'x',
                    unitPrice: String(item.defaultRate),
                    costRate: item.defaultCostRate != null ? String(item.defaultCostRate) : '',
                    tags: item.tags.join(', '),
                    priceManual: true,
                  },
                })} />
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={() => dispatch({ type: 'ADD_SECTION' })}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-4 py-3 w-full"
        >
          <Plus className="w-4 h-4" /> Add section
        </button>
      </div>

      {/* Terms panel */}
      <div className="border rounded-lg divide-y">
        <div className={cn('px-4 py-2', pendingFields.has('validUntil') && 'ai-changed')}>
          <label className="text-xs text-muted-foreground block mb-0.5">Valid until</label>
          <input
            type="date"
            value={state.validUntil}
            onChange={e => dispatch({ type: 'SET_VALID_UNTIL', value: e.target.value })}
            className="text-sm bg-transparent border-none outline-none"
          />
        </div>
        <div className={cn('px-4 py-2', pendingFields.has('notes') && 'ai-changed')}>
          <label className="text-xs text-muted-foreground block mb-0.5">Client notes</label>
          <textarea
            value={state.notes}
            onChange={e => dispatch({ type: 'SET_NOTES', value: e.target.value })}
            placeholder="Project overview, scope boundaries…"
            rows={2}
            className="text-sm w-full bg-transparent border-none outline-none resize-none"
          />
        </div>
        <div className={cn('px-4 py-2', pendingFields.has('terms') && 'ai-changed')}>
          <label className="text-xs text-muted-foreground block mb-0.5">Terms &amp; conditions</label>
          <textarea
            value={state.terms}
            onChange={e => dispatch({ type: 'SET_TERMS', value: e.target.value })}
            placeholder="Payment terms, revision limits, cancellation policy…"
            rows={3}
            className="text-sm w-full bg-transparent border-none outline-none resize-none"
          />
        </div>
      </div>

      {/* Totals bar */}
      <div className="border rounded-lg px-4 py-3 bg-muted/20">
        <div className="flex items-center justify-between text-sm">
          <div className="space-y-0.5">
            {showCosts && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Internal cost:</span>
                <span className="font-medium">{fmt(totals.totalCost, state.currency)}</span>
              </div>
            )}
            {showCosts && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Blended margin:</span>
                <span className="font-medium">{blendedMargin.toFixed(1)}%</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total quoted</div>
            <div className="text-xl font-semibold">{fmt(totals.totalQuoted, state.currency)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

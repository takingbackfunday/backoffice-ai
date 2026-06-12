'use client'

import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LineItemInput, InvoiceAction, PendingAiChanges } from './hooks/use-invoice-form'

const fmtFull = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

interface UnitPopoverProps {
  activeItem: LineItemInput
  unitPopoverId: string
  unitPopoverPos: { top: number; right: number }
  unitSuggestions: Record<string, string>
  dispatch: React.Dispatch<InvoiceAction>
  setUnitPopoverId: (id: string | null) => void
  setUnitSuggestions: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

function UnitPopover({ activeItem, unitPopoverId, unitPopoverPos, unitSuggestions, dispatch, setUnitPopoverId, setUnitSuggestions }: UnitPopoverProps) {
  const suggestedUnit = unitSuggestions[unitPopoverId] ?? null
  function selectUnit(u: string) {
    dispatch({ type: 'UPDATE_LINE_ITEM', id: unitPopoverId, key: 'qtyUnit', value: u })
    setUnitSuggestions(prev => { const next = { ...prev }; delete next[unitPopoverId]; return next })
    setUnitPopoverId(null)
  }
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setUnitPopoverId(null)} aria-hidden="true" />
      <div
        className="fixed z-50 rounded-xl border bg-background shadow-xl p-1 w-44 max-h-80 overflow-y-auto"
        style={{ top: unitPopoverPos.top, right: unitPopoverPos.right }}
      >
        <div className="pb-1.5 border-b mb-1">
          <input
            type="text"
            value={activeItem.qtyUnit}
            onChange={e => dispatch({ type: 'UPDATE_LINE_ITEM', id: unitPopoverId, key: 'qtyUnit', value: e.target.value })}
            placeholder="custom unit…"
            className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setUnitPopoverId(null) }}
            autoFocus
          />
        </div>
        {suggestedUnit && (
          <div className="pb-1 border-b mb-1">
            <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-wide px-2 pt-1 pb-0.5">Suggested</p>
            <button
              type="button"
              onClick={() => selectUnit(suggestedUnit)}
              className={`w-full text-left px-2 py-1 text-xs rounded-md transition-colors bg-amber-50 text-amber-700 hover:bg-amber-100 ${activeItem.qtyUnit === suggestedUnit ? 'font-semibold' : ''}`}
            >
              {suggestedUnit}
            </button>
          </div>
        )}
        {([
          ['Time', ['hours', 'days', 'weeks', 'months']],
          ['Area', ['sq ft', 'sq m']],
          ['Assets', ['assets']],
          ['Activities', ['visits', 'inspections', 'sessions', 'revisions', 'cleanings']],
          ['Units', ['x', 'units', 'pieces']],
          ['Licenses', ['licenses', 'seats', 'prints']],
          ['Flat fee', ['flat fee']],
        ] as [string, string[]][]).map(([group, opts]) => (
          <div key={group}>
            <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wide px-2 pt-1.5 pb-0.5">{group}</p>
            {opts.map(u => (
              <button
                key={u}
                type="button"
                onClick={() => selectUnit(u)}
                className={`w-full text-left px-2 py-1 text-xs rounded-md hover:bg-muted/50 transition-colors ${activeItem.qtyUnit === u ? 'font-semibold text-primary bg-primary/5' : ''} ${suggestedUnit === u && activeItem.qtyUnit !== u ? 'text-amber-600' : ''}`}
              >
                {u}
                {suggestedUnit === u && activeItem.qtyUnit !== u && <span className="ml-1 text-[9px] text-amber-400">●</span>}
              </button>
            ))}
          </div>
        ))}
        {activeItem.qtyUnit && (
          <button
            type="button"
            onClick={() => { dispatch({ type: 'UPDATE_LINE_ITEM', id: unitPopoverId, key: 'qtyUnit', value: '' }); setUnitPopoverId(null) }}
            className="w-full text-left px-2 py-1 text-xs text-muted-foreground hover:text-destructive rounded-md hover:bg-muted/30 mt-0.5 border-t"
          >
            Clear
          </button>
        )}
      </div>
    </>
  )
}

interface LineItemsTableProps {
  lineItems: LineItemInput[]
  dispatch: React.Dispatch<InvoiceAction>
  currency: string
  mode: 'create' | 'edit'
  projectId: string
  unitPopoverId: string | null
  setUnitPopoverId: (id: string | null) => void
  unitPopoverPos: { top: number; right: number } | null
  setUnitPopoverPos: (pos: { top: number; right: number } | null) => void
  unitSuggestions: Record<string, string>
  setUnitSuggestions: React.Dispatch<React.SetStateAction<Record<string, string>>>
  lineItemsAiChanged: boolean
  setPendingAiChanges: React.Dispatch<React.SetStateAction<PendingAiChanges>>
}

export function LineItemsTable({
  lineItems,
  dispatch,
  currency,
  mode,
  projectId,
  unitPopoverId,
  setUnitPopoverId,
  unitPopoverPos,
  setUnitPopoverPos,
  unitSuggestions,
  setUnitSuggestions,
  lineItemsAiChanged,
  setPendingAiChanges,
}: LineItemsTableProps) {
  const activeItem = unitPopoverId ? lineItems.find(i => i.id === unitPopoverId) : null

  return (
    <div className="mb-5">
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Line items</label>
      <div className={cn('rounded-xl border overflow-hidden transition-shadow', lineItemsAiChanged && 'ai-changed')}>
        <div className="grid grid-cols-[minmax(120px,1fr)_140px_110px_100px_32px] bg-muted/50 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <span>Description</span>
          <span className="text-right">Qty / Unit</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Total</span>
          <span />
        </div>
        {lineItems.map((item, idx) => {
          const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
          return (
            <div key={item.id} className="grid grid-cols-[minmax(120px,1fr)_140px_110px_100px_32px] border-t px-3 py-1.5 items-start hover:bg-muted/10 group">
              <textarea
                value={item.description}
                rows={1}
                onChange={e => {
                  dispatch({ type: 'UPDATE_LINE_ITEM', id: item.id, key: 'description', value: e.target.value })
                  setPendingAiChanges(p => ({ ...p, lineItems: false }))
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                onBlur={e => {
                  const desc = e.target.value.trim()
                  if (!desc) return
                  fetch(`/api/projects/${projectId}/invoices/suggest-unit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: desc }),
                  }).then(r => r.json()).then(j => {
                    if (j.data?.unit && j.data?.confidence === 'high') {
                      setUnitSuggestions(prev => ({ ...prev, [item.id]: j.data.unit }))
                    } else {
                      setUnitSuggestions(prev => { const next = { ...prev }; delete next[item.id]; return next })
                    }
                  }).catch(() => {})
                }}
                className="text-xs focus:outline-none bg-transparent placeholder:text-muted-foreground/50 min-w-0 w-full resize-none overflow-hidden leading-snug py-0.5"
                placeholder="Description of work or service"
                autoFocus={idx === 0 && mode === 'create' && item.description === ''}
              />
              <div className="flex items-center gap-1 justify-end">
                <input
                  type="number"
                  value={item.quantity}
                  onChange={e => dispatch({ type: 'UPDATE_LINE_ITEM', id: item.id, key: 'quantity', value: e.target.value })}
                  className="text-xs text-right focus:outline-none bg-transparent tabular-nums w-12"
                  min="0"
                  step="0.001"
                />
                <button
                  type="button"
                  onClick={e => {
                    if (unitPopoverId === item.id) { setUnitPopoverId(null); return }
                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                    setUnitPopoverPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                    setUnitPopoverId(item.id)
                  }}
                  className={`relative text-[10px] rounded px-1 py-0.5 border transition-colors ${item.qtyUnit ? 'border-primary/40 text-primary bg-primary/5' : 'border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60'}`}
                  title={unitSuggestions[item.id] ? `Suggested: ${unitSuggestions[item.id]}` : undefined}
                >
                  {item.qtyUnit || 'unit'}
                  {unitSuggestions[item.id] && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400 border border-background" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-end">
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={e => dispatch({ type: 'UPDATE_LINE_ITEM', id: item.id, key: 'unitPrice', value: e.target.value })}
                  className="text-xs text-right focus:outline-none bg-transparent tabular-nums w-full"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <span className="text-xs text-right tabular-nums text-muted-foreground pr-1">
                {lineTotal > 0 ? fmtFull(lineTotal, currency) : '—'}
              </span>
              <button
                type="button"
                onClick={() => lineItems.length > 1 && dispatch({ type: 'REMOVE_LINE_ITEM', id: item.id })}
                className="flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-20"
                disabled={lineItems.length === 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
        <div className="border-t px-3 py-1.5">
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_LINE_ITEM' })}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add line
          </button>
        </div>
      </div>
      {activeItem && unitPopoverPos && (
        <UnitPopover
          activeItem={activeItem}
          unitPopoverId={unitPopoverId!}
          unitPopoverPos={unitPopoverPos}
          unitSuggestions={unitSuggestions}
          dispatch={dispatch}
          setUnitPopoverId={setUnitPopoverId}
          setUnitSuggestions={setUnitSuggestions}
        />
      )}
    </div>
  )
}

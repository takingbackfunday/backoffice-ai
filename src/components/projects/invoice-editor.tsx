'use client'

import { useReducer, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, X, Sparkles, Send, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface LineItemInput {
  id: string // client-only key
  description: string
  quantity: string
  unitPrice: string
  isTaxLine: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  actions?: AiAction[]
}

type AiAction =
  | { type: 'set_line_items'; lineItems: { description: string; quantity: number; unitPrice: number }[] }
  | { type: 'set_due_date'; value: string }
  | { type: 'set_notes'; value: string }
  | { type: 'set_tax'; label: string; amount: number }
  | { type: 'ask_clarification'; question: string }

interface InvoiceState {
  lineItems: LineItemInput[]
  taxEnabled: boolean
  taxLabel: string
  taxMode: 'percent' | 'flat'
  taxRate: string    // percent or flat amount as string
  jobId: string
  dueDate: string
  issueDate: string
  currency: string
  notes: string
  aiSuggestedNotes: boolean
}

type InvoiceAction =
  | { type: 'SET_LINE_ITEMS'; items: LineItemInput[] }
  | { type: 'UPDATE_LINE_ITEM'; id: string; key: keyof LineItemInput; value: string | boolean }
  | { type: 'ADD_LINE_ITEM' }
  | { type: 'REMOVE_LINE_ITEM'; id: string }
  | { type: 'SET_TAX_ENABLED'; enabled: boolean }
  | { type: 'SET_TAX_LABEL'; label: string }
  | { type: 'SET_TAX_MODE'; mode: 'percent' | 'flat' }
  | { type: 'SET_TAX_RATE'; rate: string }
  | { type: 'SET_TAX_FROM_AI'; label: string; amount: number }
  | { type: 'SET_JOB'; jobId: string }
  | { type: 'SET_DUE_DATE'; value: string }
  | { type: 'SET_ISSUE_DATE'; value: string }
  | { type: 'SET_CURRENCY'; value: string }
  | { type: 'SET_NOTES'; value: string; aiSuggested?: boolean }

interface Props {
  mode: 'create' | 'edit'
  projectId: string
  projectSlug: string
  clientName: string
  clientEmail: string | null
  paymentTermDays: number
  billingType: string
  company: string | null
  jobs: { id: string; name: string }[]
  // pre-fill defaults from last invoice (create mode only)
  lastInvoiceDefaults?: {
    taxEnabled: boolean
    taxLabel: string
    taxMode: 'percent' | 'flat'
    taxRate: string
    currency: string
    notes: string
  }
  // edit mode only
  existingInvoice?: {
    id: string
    invoiceNumber: string
    status: string
    jobId: string | null
    dueDate: string
    issueDate: string
    currency: string
    notes: string | null
    lineItems: { id: string; description: string; quantity: number; unitPrice: number; isTaxLine: boolean }[]
    totalPaid: number
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function uid() {
  return Math.random().toString(36).slice(2)
}

function defaultDueDate(paymentTermDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + paymentTermDays)
  return d.toISOString().split('T')[0]
}

const fmtFull = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

function calcSubtotal(items: LineItemInput[]): number {
  return items
    .filter(i => !i.isTaxLine && i.description.trim())
    .reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0), 0)
}

function calcTaxAmount(state: InvoiceState, subtotal: number): number {
  if (!state.taxEnabled) return 0
  const rate = parseFloat(state.taxRate) || 0
  if (state.taxMode === 'percent') return (subtotal * rate) / 100
  return rate
}

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'SGD', 'HKD']

/* ------------------------------------------------------------------ */
/*  Reducer                                                             */
/* ------------------------------------------------------------------ */

function reducer(state: InvoiceState, action: InvoiceAction): InvoiceState {
  switch (action.type) {
    case 'SET_LINE_ITEMS':
      return { ...state, lineItems: action.items }
    case 'UPDATE_LINE_ITEM':
      return {
        ...state,
        lineItems: state.lineItems.map(i =>
          i.id === action.id ? { ...i, [action.key]: action.value } : i
        ),
      }
    case 'ADD_LINE_ITEM':
      return { ...state, lineItems: [...state.lineItems, { id: uid(), description: '', quantity: '1', unitPrice: '', isTaxLine: false }] }
    case 'REMOVE_LINE_ITEM':
      return { ...state, lineItems: state.lineItems.filter(i => i.id !== action.id) }
    case 'SET_TAX_ENABLED':
      return { ...state, taxEnabled: action.enabled }
    case 'SET_TAX_LABEL':
      return { ...state, taxLabel: action.label }
    case 'SET_TAX_MODE':
      return { ...state, taxMode: action.mode }
    case 'SET_TAX_RATE':
      return { ...state, taxRate: action.rate }
    case 'SET_TAX_FROM_AI':
      return { ...state, taxEnabled: true, taxLabel: action.label, taxMode: 'flat', taxRate: String(action.amount) }
    case 'SET_JOB':
      return { ...state, jobId: action.jobId }
    case 'SET_DUE_DATE':
      return { ...state, dueDate: action.value }
    case 'SET_ISSUE_DATE':
      return { ...state, issueDate: action.value }
    case 'SET_CURRENCY':
      return { ...state, currency: action.value }
    case 'SET_NOTES':
      return { ...state, notes: action.value, aiSuggestedNotes: action.aiSuggested ?? false }
    default:
      return state
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function InvoiceEditor({
  mode,
  projectId,
  projectSlug,
  clientName,
  clientEmail,
  paymentTermDays,
  billingType,
  company,
  jobs: initialJobs,
  lastInvoiceDefaults,
  existingInvoice,
}: Props) {
  const router = useRouter()
  const [jobs, setJobs] = useState(initialJobs)
  const [newJobName, setNewJobName] = useState('')
  const [creatingJob, setCreatingJob] = useState(false)
  const [showNewJob, setShowNewJob] = useState(false)

  // Build initial state
  const initial: InvoiceState = existingInvoice
    ? {
        lineItems: existingInvoice.lineItems
          .filter(i => !i.isTaxLine)
          .map(i => ({ id: uid(), description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), isTaxLine: false })),
        taxEnabled: existingInvoice.lineItems.some(i => i.isTaxLine),
        taxLabel: existingInvoice.lineItems.find(i => i.isTaxLine)?.description ?? 'Tax',
        taxMode: 'flat',
        taxRate: String(existingInvoice.lineItems.find(i => i.isTaxLine)?.unitPrice ?? 0),
        jobId: existingInvoice.jobId ?? '',
        dueDate: existingInvoice.dueDate.split('T')[0],
        issueDate: existingInvoice.issueDate.split('T')[0],
        currency: existingInvoice.currency,
        notes: existingInvoice.notes ?? '',
        aiSuggestedNotes: false,
      }
    : {
        lineItems: [{ id: uid(), description: '', quantity: '1', unitPrice: '', isTaxLine: false }],
        taxEnabled: lastInvoiceDefaults?.taxEnabled ?? false,
        taxLabel: lastInvoiceDefaults?.taxLabel ?? 'Tax',
        taxMode: lastInvoiceDefaults?.taxMode ?? 'percent',
        taxRate: lastInvoiceDefaults?.taxRate ?? '',
        jobId: '',
        dueDate: defaultDueDate(paymentTermDays),
        issueDate: new Date().toISOString().split('T')[0],
        currency: lastInvoiceDefaults?.currency ?? 'USD',
        notes: lastInvoiceDefaults?.notes ?? '',
        aiSuggestedNotes: false,
      }

  const [state, dispatch] = useReducer(reducer, initial)

  // AI chat
  const [chatVisible, setChatVisible] = useState(mode === 'create')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: mode === 'create'
      ? `Hi! I can help you build this invoice for ${clientName}. Just describe the work — I'll fill in the line items, due date, and notes.`
      : `I can help you adjust this invoice for ${clientName}. What would you like to change?`
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Derived totals
  const subtotal = calcSubtotal(state.lineItems)
  const taxAmount = calcTaxAmount(state, subtotal)
  const total = subtotal + taxAmount

  // Edit guard — total vs paid
  const paymentsExist = (existingInvoice?.totalPaid ?? 0) > 0
  const totalBelowPaid = paymentsExist && total < (existingInvoice?.totalPaid ?? 0)
  const isSent = existingInvoice && ['SENT', 'PARTIAL'].includes(existingInvoice.status)

  /* ---------------------------------------------------------------- */
  /*  AI chat                                                           */
  /* ---------------------------------------------------------------- */

  function buildCurrentInvoiceSnapshot() {
    return {
      lineItems: state.lineItems
        .filter(i => i.description.trim())
        .map(i => ({ description: i.description, quantity: parseFloat(i.quantity) || 1, unitPrice: parseFloat(i.unitPrice) || 0 })),
      tax: state.taxEnabled ? { label: state.taxLabel, amount: taxAmount } : null,
      dueDate: state.dueDate,
      issueDate: state.issueDate,
      currency: state.currency,
      notes: state.notes,
      subtotal,
      total,
    }
  }

  async function sendChatMessage() {
    const text = chatInput.trim()
    if (!text || chatLoading) return

    const userMsg: ChatMessage = { role: 'user', text }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const history = [...chatMessages, userMsg].map(m => ({ role: m.role, content: m.text }))
      const res = await fetch(`/api/projects/${projectId}/invoices/ai-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          currentInvoice: buildCurrentInvoiceSnapshot(),
          clientName,
          company,
          paymentTermDays,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', text: json.error ?? 'Something went wrong. Please try again.' }])
        return
      }

      const { text: aiText, actions } = json.data as { text: string; actions: AiAction[] }

      // Apply actions to form state
      if (actions?.length) {
        for (const action of actions) {
          applyAiAction(action)
        }
      }

      setChatMessages(prev => [...prev, { role: 'assistant', text: aiText, actions }])
    } finally {
      setChatLoading(false)
    }
  }

  function applyAiAction(action: AiAction) {
    switch (action.type) {
      case 'set_line_items':
        dispatch({
          type: 'SET_LINE_ITEMS',
          items: action.lineItems.map(i => ({
            id: uid(),
            description: i.description,
            quantity: String(i.quantity),
            unitPrice: String(i.unitPrice),
            isTaxLine: false,
          })),
        })
        break
      case 'set_due_date':
        dispatch({ type: 'SET_DUE_DATE', value: action.value })
        break
      case 'set_notes':
        dispatch({ type: 'SET_NOTES', value: action.value })
        break
      case 'set_tax':
        dispatch({ type: 'SET_TAX_FROM_AI', label: action.label, amount: action.amount })
        break
      case 'ask_clarification':
        // Will be shown as a chat message — no form change
        break
    }
  }

  /* ---------------------------------------------------------------- */
  /*  AI Finalize                                                       */
  /* ---------------------------------------------------------------- */

  async function handleFinalize() {
    setFinalizing(true)
    setSaveError(null)
    try {
      const snapshot = buildCurrentInvoiceSnapshot()
      console.log('[ai-finalize] sending snapshot — lineItems:', snapshot.lineItems.length, '| total:', snapshot.total)

      const res = await fetch(`/api/projects/${projectId}/invoices/ai-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentInvoice: snapshot,
          clientName,
          company,
          paymentTermDays,
          billingType,
        }),
      })
      const json = await res.json()
      console.log('[ai-finalize] response status:', res.status, '| json.error:', json.error, '| data keys:', json.data ? Object.keys(json.data) : null)

      if (!res.ok || json.error) {
        setSaveError(json.error ?? `AI Finalize failed (${res.status})`)
        return
      }

      const { suggestedNotes, questions } = json.data as { suggestedNotes: string | null; questions: string[] }

      if (suggestedNotes) {
        dispatch({ type: 'SET_NOTES', value: suggestedNotes, aiSuggested: true })
      }

      // Always open chat after finalize so the user can see what happened
      setChatVisible(true)
      if (questions.length > 0) {
        setChatMessages(prev => [
          ...prev,
          ...questions.map(q => ({ role: 'assistant' as const, text: q })),
        ])
      } else if (suggestedNotes) {
        setChatMessages(prev => [...prev, { role: 'assistant', text: 'I\'ve filled in payment terms and notes based on your setup. Feel free to edit them.' }])
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', text: 'Your invoice looks good — notes are already thorough. Nothing to add.' }])
      }
    } catch (err) {
      console.error('[ai-finalize] client error:', err)
      setSaveError('AI Finalize failed — check console for details')
    } finally {
      setFinalizing(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Save                                                              */
  /* ---------------------------------------------------------------- */

  function buildLineItemsPayload() {
    const regular = state.lineItems
      .filter(i => i.description.trim())
      .map(i => ({
        description: i.description.trim(),
        quantity: parseFloat(i.quantity) || 1,
        unitPrice: parseFloat(i.unitPrice) || 0,
        isTaxLine: false,
      }))

    if (state.taxEnabled && taxAmount > 0) {
      regular.push({
        description: state.taxLabel || 'Tax',
        quantity: 1,
        unitPrice: taxAmount,
        isTaxLine: true,
      })
    }

    return regular
  }

  async function handleCreateJob() {
    if (!newJobName.trim()) return
    setCreatingJob(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newJobName.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) return
      const newJob = { id: json.data.id, name: json.data.name }
      setJobs(prev => [...prev, newJob])
      dispatch({ type: 'SET_JOB', jobId: newJob.id })
      setNewJobName('')
      setShowNewJob(false)
    } finally {
      setCreatingJob(false)
    }
  }

  async function handleSave(sendAfter: boolean) {
    if (!state.dueDate) { setSaveError('Due date is required'); return }
    const lineItemsPayload = buildLineItemsPayload()
    if (lineItemsPayload.filter(i => !i.isTaxLine).length === 0) {
      setSaveError('At least one line item is required')
      return
    }
    if (totalBelowPaid) {
      setSaveError(`Total cannot be less than amount already paid (${fmtFull(existingInvoice!.totalPaid, state.currency)})`)
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      let invoiceId: string

      if (mode === 'create') {
        const res = await fetch(`/api/projects/${projectId}/invoices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: state.jobId || undefined,
            dueDate: state.dueDate,
            currency: state.currency,
            notes: state.notes || undefined,
            lineItems: lineItemsPayload,
          }),
        })
        const json = await res.json()
        if (!res.ok || json.error) { setSaveError(json.error ?? 'Failed to create invoice'); return }
        invoiceId = json.data.id

      } else {
        const res = await fetch(`/api/projects/${projectId}/invoices/${existingInvoice!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: state.jobId || undefined,
            dueDate: state.dueDate,
            currency: state.currency,
            notes: state.notes || undefined,
            lineItems: lineItemsPayload,
          }),
        })
        const json = await res.json()
        if (!res.ok || json.error) { setSaveError(json.error ?? 'Failed to update invoice'); return }
        invoiceId = existingInvoice!.id
      }

      router.push(`/projects/${projectSlug}/invoices/${invoiceId}${sendAfter ? '?send=1' : ''}`)
    } finally {
      setSaving(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */

  const isVoidOrPaid = existingInvoice && ['PAID', 'VOID'].includes(existingInvoice.status)

  return (
    <div className="flex gap-0 min-h-0">

      {/* ── LEFT: Form ─────────────────────────────────────────── */}
      <div className={cn('flex-1 min-w-0 transition-all duration-300', chatVisible ? 'max-w-[60%]' : 'max-w-full')}>
        <div className="pr-6">

          {/* Edit warnings */}
          {isSent && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This invoice has already been sent. Editing will <strong>not</strong> automatically notify your client.
            </div>
          )}
          {totalBelowPaid && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Total cannot be less than the amount already paid ({fmtFull(existingInvoice!.totalPaid, state.currency)}).
            </div>
          )}

          {/* Job selector */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job (optional)</label>
              {!showNewJob && (
                <button type="button" onClick={() => setShowNewJob(true)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                  <Plus className="h-3 w-3" /> New job
                </button>
              )}
            </div>
            {showNewJob ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newJobName}
                  onChange={e => setNewJobName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateJob() } if (e.key === 'Escape') { setShowNewJob(false); setNewJobName('') } }}
                  placeholder="Job name…"
                  autoFocus
                  className="flex-1 max-w-sm rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button type="button" onClick={handleCreateJob} disabled={creatingJob || !newJobName.trim()} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                  {creatingJob ? '…' : 'Create'}
                </button>
                <button type="button" onClick={() => { setShowNewJob(false); setNewJobName('') }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            ) : (
              <select
                value={state.jobId}
                onChange={e => dispatch({ type: 'SET_JOB', jobId: e.target.value })}
                className="w-full max-w-sm rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="">No specific job</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            )}
          </div>

          {/* Line items */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Line items</label>
            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_110px_100px_32px] bg-muted/50 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {state.lineItems.map((item, idx) => {
                const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
                return (
                  <div key={item.id} className="grid grid-cols-[1fr_80px_110px_100px_32px] border-t px-3 py-1.5 items-center hover:bg-muted/10 group">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => dispatch({ type: 'UPDATE_LINE_ITEM', id: item.id, key: 'description', value: e.target.value })}
                      className="text-sm focus:outline-none bg-transparent placeholder:text-muted-foreground/50 min-w-0"
                      placeholder="Description of work or service"
                      autoFocus={idx === 0 && mode === 'create' && item.description === ''}
                    />
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => dispatch({ type: 'UPDATE_LINE_ITEM', id: item.id, key: 'quantity', value: e.target.value })}
                      className="text-sm text-right focus:outline-none bg-transparent tabular-nums w-full"
                      min="0"
                      step="0.001"
                    />
                    <div className="flex items-center justify-end">
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={e => dispatch({ type: 'UPDATE_LINE_ITEM', id: item.id, key: 'unitPrice', value: e.target.value })}
                        className="text-sm text-right focus:outline-none bg-transparent tabular-nums w-full"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <span className="text-sm text-right tabular-nums text-muted-foreground pr-1">
                      {lineTotal > 0 ? fmtFull(lineTotal, state.currency) : '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => state.lineItems.length > 1 && dispatch({ type: 'REMOVE_LINE_ITEM', id: item.id })}
                      className="flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-20"
                      disabled={state.lineItems.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
              {/* Add line — bottom-left of table */}
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
          </div>

          {/* Tax */}
          <div className="mb-5">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.taxEnabled}
                  onChange={e => dispatch({ type: 'SET_TAX_ENABLED', enabled: e.target.checked })}
                  className="rounded border"
                />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add tax</span>
              </label>
              {state.taxEnabled && (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={state.taxLabel}
                    onChange={e => dispatch({ type: 'SET_TAX_LABEL', label: e.target.value })}
                    className="rounded-lg border px-2 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="GST, VAT, Sales Tax…"
                  />
                  <select
                    value={state.taxMode}
                    onChange={e => dispatch({ type: 'SET_TAX_MODE', mode: e.target.value as 'percent' | 'flat' })}
                    className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none"
                  >
                    <option value="percent">%</option>
                    <option value="flat">Flat</option>
                  </select>
                  <input
                    type="number"
                    value={state.taxRate}
                    onChange={e => dispatch({ type: 'SET_TAX_RATE', rate: e.target.value })}
                    className="rounded-lg border px-2 py-1.5 text-sm w-24 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={state.taxMode === 'percent' ? '15' : '0.00'}
                    min="0"
                    step={state.taxMode === 'percent' ? '0.1' : '0.01'}
                  />
                  {taxAmount > 0 && (
                    <span className="text-xs text-muted-foreground">= {fmtFull(taxAmount, state.currency)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="mb-6 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums font-medium">{fmtFull(subtotal, state.currency)}</span>
              </div>
              {state.taxEnabled && taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{state.taxLabel || 'Tax'}{state.taxMode === 'percent' && state.taxRate ? ` (${state.taxRate}%)` : ''}</span>
                  <span className="tabular-nums">{fmtFull(taxAmount, state.currency)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t">
                <span className="text-sm font-bold">Total</span>
                <span className="text-lg font-bold tabular-nums">{fmtFull(total, state.currency)}</span>
              </div>
            </div>
          </div>

          {/* Dates + currency */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Due date <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                value={state.dueDate}
                onChange={e => dispatch({ type: 'SET_DUE_DATE', value: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Issue date</label>
              <input
                type="date"
                value={state.issueDate}
                onChange={e => dispatch({ type: 'SET_ISSUE_DATE', value: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Currency</label>
              <select
                value={state.currency}
                onChange={e => dispatch({ type: 'SET_CURRENCY', value: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes / payment terms</label>
              {state.aiSuggestedNotes && (
                <span className="text-[10px] text-primary flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> AI suggested
                </span>
              )}
            </div>
            <textarea
              value={state.notes}
              onChange={e => dispatch({ type: 'SET_NOTES', value: e.target.value })}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              placeholder="Payment instructions, late fee policy, thank-you note…"
            />
          </div>

          {/* Save errors */}
          {saveError && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {saveError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleFinalize}
              disabled={finalizing}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {finalizing ? 'Reviewing…' : 'AI Finalize'}
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Save as draft' : 'Save changes'}
            </button>

            {(!existingInvoice || existingInvoice.status === 'DRAFT') && (
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving || !clientEmail}
                title={!clientEmail ? 'Add client email to send' : undefined}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                {saving ? 'Sending…' : 'Create & send'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── AI chat toggle (always visible) ─────────────────────── */}
      {!chatVisible && (
        <button
          type="button"
          onClick={() => setChatVisible(true)}
          className="fixed right-6 bottom-6 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 z-50"
        >
          <Sparkles className="h-4 w-4" />
          AI Chat
        </button>
      )}

      {/* ── RIGHT: AI chat panel ─────────────────────────────────── */}
      {chatVisible && (
        <div className="w-[380px] flex-shrink-0 border-l flex flex-col bg-background">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold">AI Invoice Assistant</span>
            </div>
            <button
              type="button"
              onClick={() => setChatVisible(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                )}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  {/* Action confirmations */}
                  {msg.actions?.filter(a => a.type !== 'ask_clarification').map((a, i) => (
                    <p key={i} className="text-[10px] mt-1 opacity-60 flex items-center gap-1">
                      <span>✓</span>
                      <span>
                        {a.type === 'set_line_items' ? `Updated ${(a as { type: 'set_line_items'; lineItems: unknown[] }).lineItems.length} line item(s)` :
                         a.type === 'set_due_date' ? `Due date → ${(a as { type: 'set_due_date'; value: string }).value}` :
                         a.type === 'set_notes' ? 'Updated notes' :
                         a.type === 'set_tax' ? `Tax → ${(a as { type: 'set_tax'; label: string; amount: number }).label} ${fmtFull((a as { type: 'set_tax'; label: string; amount: number }).amount, state.currency)}` : ''}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex gap-2 items-end">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendChatMessage()
                  }
                }}
                placeholder="Describe the work, ask to change something…"
                rows={2}
                className="flex-1 rounded-xl border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-h-[60px]"
              />
              <button
                type="button"
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || chatLoading}
                className="rounded-xl bg-primary p-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors self-end"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Enter to send · Shift+Enter for newline</p>
          </div>
        </div>
      )}
    </div>
  )
}


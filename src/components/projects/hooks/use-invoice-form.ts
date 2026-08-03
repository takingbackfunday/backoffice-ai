'use client'

import { useReducer, useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '@/stores/chat-store'
import type { EditorAction } from '@/lib/agent/page-context'
import { usePageContext } from '@/components/chat/page-context-provider'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface LineItemInput {
  id: string
  description: string
  quantity: string
  qtyUnit: string
  unitPrice: string
  isTaxLine: boolean
}

export interface InvoiceState {
  lineItems: LineItemInput[]
  taxEnabled: boolean
  taxLabel: string
  taxMode: 'percent' | 'flat'
  taxRate: string
  jobId: string
  dueDate: string
  issueDate: string
  currency: string
  notes: string
  aiSuggestedNotes: boolean
}

export interface PendingAiChanges {
  lineItems: boolean
  notes: boolean
  dueDate: boolean
  issueDate: boolean
  currency: boolean
  tax: boolean
  jobId: boolean
}

export const NO_CHANGES: PendingAiChanges = { lineItems: false, notes: false, dueDate: false, issueDate: false, currency: false, tax: false, jobId: false }

export type InvoiceAction =
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
  | { type: 'ADD_LINE_ITEMS'; items: LineItemInput[] }

export interface ExistingInvoice {
  id: string
  invoiceNumber: string
  status: string
  jobId: string | null
  dueDate: string
  issueDate: string
  currency: string
  notes: string | null
  totalPaid: number
  lineItems: { description: string; quantity: number; qtyUnit?: string | null; unitPrice: number; isTaxLine: boolean }[]
}

export interface InvoiceEditorProps {
  mode: 'create' | 'edit'
  projectId: string
  projectSlug: string
  clientName: string
  clientEmail: string | null
  paymentTermDays: number
  billingType: string
  company: string | null
  jobs: { id: string; name: string }[]
  lastInvoiceDefaults?: {
    taxEnabled: boolean
    taxLabel: string
    taxMode: 'percent' | 'flat'
    taxRate: string
    currency: string
  }
  invoiceNotesDefault?: string
  recentInvoices?: { id: string; invoiceNumber: string; dueDate: string; total: number; currency: string }[]
  existingInvoice?: ExistingInvoice
  quoteId?: string
  quoteNumber?: string
  invoicePaymentNote?: string
  paymentMethods?: PaymentMethods
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function defaultDueDate(paymentTermDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + paymentTermDays)
  return d.toISOString().split('T')[0]
}

export function calcSubtotal(items: LineItemInput[]): number {
  return items
    .filter(i => !i.isTaxLine && i.description.trim())
    .reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0), 0)
}

export function calcTaxAmount(state: InvoiceState, subtotal: number): number {
  if (!state.taxEnabled) return 0
  const rate = parseFloat(state.taxRate) || 0
  return state.taxMode === 'percent' ? subtotal * (rate / 100) : rate
}

export const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'SGD', 'HKD']

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
      return { ...state, lineItems: [...state.lineItems, { id: uid(), description: '', quantity: '1', qtyUnit: 'x', unitPrice: '', isTaxLine: false }] }
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
      return { ...state, taxEnabled: true, taxLabel: action.label, taxRate: String(action.amount), taxMode: 'flat' }
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
    case 'ADD_LINE_ITEMS': {
      const hasRealItems = state.lineItems.some(i => i.description.trim())
      return {
        ...state,
        lineItems: hasRealItems ? [...state.lineItems, ...action.items] : action.items,
      }
    }
    default:
      return state
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                                */
/* ------------------------------------------------------------------ */

export function useInvoiceForm(props: InvoiceEditorProps) {
  const {
    projectId,
    paymentTermDays,
    existingInvoice,
    lastInvoiceDefaults,
    invoiceNotesDefault = '',
    recentInvoices: initialRecentInvoices,
    clientName,
    company,
    billingType,
  } = props

  const initial: InvoiceState = existingInvoice
    ? {
        lineItems: existingInvoice.lineItems
          .filter(i => !i.isTaxLine)
          .map(i => ({ id: uid(), description: i.description, quantity: String(i.quantity), qtyUnit: i.qtyUnit ?? '', unitPrice: String(i.unitPrice), isTaxLine: false })),
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
        lineItems: [{ id: uid(), description: '', quantity: '1', qtyUnit: 'x', unitPrice: '', isTaxLine: false }],
        taxEnabled: lastInvoiceDefaults?.taxEnabled ?? false,
        taxLabel: lastInvoiceDefaults?.taxLabel ?? 'Tax',
        taxMode: lastInvoiceDefaults?.taxMode ?? 'percent',
        taxRate: lastInvoiceDefaults?.taxRate ?? '',
        jobId: '',
        dueDate: defaultDueDate(paymentTermDays),
        issueDate: new Date().toISOString().split('T')[0],
        currency: lastInvoiceDefaults?.currency ?? 'USD',
        notes: invoiceNotesDefault,
        aiSuggestedNotes: false,
      }

  const [state, dispatch] = useReducer(reducer, initial)

  const [pendingAiChanges, setPendingAiChanges] = useState<PendingAiChanges>(NO_CHANGES)
  const [preAiSnapshot, setPreAiSnapshot] = useState<InvoiceState | null>(null)
  const hasPendingChanges = Object.values(pendingAiChanges).some(Boolean)

  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const applyEditorAction = useCallback((action: EditorAction) => {
    setPreAiSnapshot(prev => prev ?? { ...stateRef.current, lineItems: stateRef.current.lineItems.map(i => ({ ...i })) })
    setPendingAiChanges(prev => {
      const next = { ...prev }
      if (action.type === 'set_line_items') next.lineItems = true
      if (action.type === 'set_tax') next.tax = true
      if (action.type === 'set_due_date') next.dueDate = true
      if (action.type === 'set_notes') next.notes = true
      if (action.type === 'set_currency') next.currency = true
      return next
    })
    switch (action.type) {
      case 'set_line_items':
        dispatch({ type: 'SET_LINE_ITEMS', items: action.lineItems })
        break
      case 'set_tax':
        dispatch({ type: 'SET_TAX_FROM_AI', label: action.label, amount: action.amount })
        break
      case 'set_due_date':
        dispatch({ type: 'SET_DUE_DATE', value: action.value })
        break
      case 'set_notes':
        dispatch({ type: 'SET_NOTES', value: action.value, aiSuggested: true })
        break
      case 'set_currency':
        dispatch({ type: 'SET_CURRENCY', value: action.value })
        break
    }
  }, [dispatch])

  usePageContext({
    entityType: 'invoice',
    entityId: existingInvoice?.id,
    entityName: existingInvoice?.invoiceNumber,
    snapshot: {
      lineItems: state.lineItems,
      taxEnabled: state.taxEnabled,
      taxLabel: state.taxLabel,
      taxRate: state.taxRate,
      dueDate: state.dueDate,
      issueDate: state.issueDate,
      currency: state.currency,
      notes: state.notes,
      jobId: state.jobId,
    },
    dispatch: applyEditorAction,
  })

  /* --- Derived --- */
  const subtotal = calcSubtotal(state.lineItems)
  const taxAmount = calcTaxAmount(state, subtotal)
  const total = subtotal + taxAmount
  const paymentsExist = (existingInvoice?.totalPaid ?? 0) > 0
  const totalBelowPaid = paymentsExist && total < (existingInvoice?.totalPaid ?? 0)
  const isSent = existingInvoice && ['SENT', 'PARTIAL'].includes(existingInvoice.status)
  const isVoidOrPaid = existingInvoice && ['PAID', 'VOID'].includes(existingInvoice.status)

  /* --- Copy picker --- */
  const [showCopyPicker, setShowCopyPicker] = useState(false)
  const [recentInvoices, setRecentInvoices] = useState(initialRecentInvoices ?? null as null | typeof initialRecentInvoices)
  const [loadingRecent, setLoadingRecent] = useState(false)

  async function openCopyPicker() {
    setShowCopyPicker(true)
    if (recentInvoices !== null) return
    setLoadingRecent(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices`)
      const json = await res.json()
      const all = (json.data ?? []) as { id: string; invoiceNumber: string; status: string; dueDate: string; lineItems: unknown[]; currency: string }[]
      const relevant = all
        .filter(i => ['SENT', 'PARTIAL', 'PAID', 'OVERDUE'].includes(i.status))
        .slice(0, 10)
        .map(i => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          dueDate: i.dueDate,
          total: (i.lineItems as { quantity: number; unitPrice: number; isTaxLine: boolean }[]).reduce((s, l) => s + (l.isTaxLine ? 0 : l.quantity * l.unitPrice), 0),
          currency: i.currency,
        }))
      setRecentInvoices(relevant)
    } catch {
      setRecentInvoices([])
    } finally {
      setLoadingRecent(false)
    }
  }

  async function copyFromInvoice(invoiceId: string) {
    setShowCopyPicker(false)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}`)
      const json = await res.json()
      if (!res.ok || json.error) return
      const inv = json.data
      dispatch({
        type: 'SET_LINE_ITEMS',
        items: (inv.lineItems as { description: string; quantity: number; qtyUnit?: string | null; unitPrice: number; isTaxLine: boolean }[])
          .filter((i) => !i.isTaxLine)
          .map((i) => ({ id: uid(), description: i.description, quantity: String(i.quantity), qtyUnit: i.qtyUnit ?? '', unitPrice: String(i.unitPrice), isTaxLine: false })),
      })
      if (inv.notes) dispatch({ type: 'SET_NOTES', value: inv.notes })
      if (inv.currency) dispatch({ type: 'SET_CURRENCY', value: inv.currency })
      const taxLine = (inv.lineItems as { isTaxLine: boolean; description: string; unitPrice: number }[]).find(i => i.isTaxLine)
      if (taxLine) dispatch({ type: 'SET_TAX_FROM_AI', label: taxLine.description, amount: taxLine.unitPrice })
    } catch { /* silent */ }
  }

  /* --- SessionStorage listener --- */
  useEffect(() => {
    function onAiTrigger() {
      const pending = sessionStorage.getItem('invoice-ai-prompt')
      if (!pending) return
      sessionStorage.removeItem('invoice-ai-prompt')
      useChatStore.getState().openWithMessage(pending)
    }
    function onCopyPickerTrigger() {
      if (!sessionStorage.getItem('invoice-open-copy-picker')) return
      sessionStorage.removeItem('invoice-open-copy-picker')
      openCopyPicker()
    }
    function onFromTransactionsTrigger() {
      const pending = sessionStorage.getItem('invoice-from-transactions')
      if (!pending) return
      sessionStorage.removeItem('invoice-from-transactions')
      try {
        const items = JSON.parse(pending) as LineItemInput[]
        if (Array.isArray(items) && items.length > 0) {
          dispatch({ type: 'ADD_LINE_ITEMS', items })
        }
      } catch { /* silent */ }
    }
    onAiTrigger()
    onCopyPickerTrigger()
    onFromTransactionsTrigger()
    window.addEventListener('invoice-ai-trigger', onAiTrigger)
    window.addEventListener('invoice-copy-picker-trigger', onCopyPickerTrigger)
    window.addEventListener('invoice-from-transactions-trigger', onFromTransactionsTrigger)
    return () => {
      window.removeEventListener('invoice-ai-trigger', onAiTrigger)
      window.removeEventListener('invoice-copy-picker-trigger', onCopyPickerTrigger)
      window.removeEventListener('invoice-from-transactions-trigger', onFromTransactionsTrigger)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --- Snapshot builder --- */
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

  /* --- HITL --- */
  function confirmAiChanges() {
    setPendingAiChanges(NO_CHANGES)
    setPreAiSnapshot(null)
  }

  function undoAiChanges() {
    if (!preAiSnapshot) return
    dispatch({ type: 'SET_LINE_ITEMS', items: preAiSnapshot.lineItems })
    if (preAiSnapshot.notes !== state.notes) dispatch({ type: 'SET_NOTES', value: preAiSnapshot.notes })
    if (preAiSnapshot.dueDate !== state.dueDate) dispatch({ type: 'SET_DUE_DATE', value: preAiSnapshot.dueDate })
    if (preAiSnapshot.issueDate !== state.issueDate) dispatch({ type: 'SET_ISSUE_DATE', value: preAiSnapshot.issueDate })
    if (preAiSnapshot.currency !== state.currency) dispatch({ type: 'SET_CURRENCY', value: preAiSnapshot.currency })
    if (preAiSnapshot.jobId !== state.jobId) dispatch({ type: 'SET_JOB', jobId: preAiSnapshot.jobId })
    if (preAiSnapshot.taxEnabled !== state.taxEnabled || preAiSnapshot.taxRate !== state.taxRate) {
      dispatch({ type: 'SET_TAX_ENABLED', enabled: preAiSnapshot.taxEnabled })
      dispatch({ type: 'SET_TAX_LABEL', label: preAiSnapshot.taxLabel })
      dispatch({ type: 'SET_TAX_MODE', mode: preAiSnapshot.taxMode })
      dispatch({ type: 'SET_TAX_RATE', rate: preAiSnapshot.taxRate })
    }
    setPendingAiChanges(NO_CHANGES)
    setPreAiSnapshot(null)
  }

  /* --- Finalize --- */
  const [finalizing, setFinalizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleFinalize() {
    setFinalizing(true)
    setSaveError(null)
    try {
      const snapshot = buildCurrentInvoiceSnapshot()
      const res = await fetch(`/api/projects/${projectId}/invoices/ai-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentInvoice: snapshot, clientName, company, paymentTermDays, billingType }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setSaveError(json.error ?? `AI Finalize failed (${res.status})`)
        return
      }
      const { suggestedNotes, questions } = json.data as { suggestedNotes: string | null; questions: string[] }
      if (suggestedNotes) dispatch({ type: 'SET_NOTES', value: suggestedNotes, aiSuggested: true })
      const followUp = questions.length > 0
        ? questions.join(' ')
        : suggestedNotes
          ? 'I\'ve applied suggested notes to the invoice — let me know if you\'d like any changes.'
          : 'Your invoice looks good. Let me know if you\'d like any changes.'
      useChatStore.getState().openWithMessage(followUp)
    } catch {
      setSaveError('AI Finalize failed — check console for details')
    } finally {
      setFinalizing(false)
    }
  }

  /* --- Save --- */
  function buildLineItemsPayload() {
    const regular = state.lineItems
      .filter(i => i.description.trim())
      .map(i => ({
        description: i.description.trim(),
        quantity: parseFloat(i.quantity) || 1,
        qtyUnit: i.qtyUnit.trim() || undefined,
        unitPrice: parseFloat(i.unitPrice) || 0,
        isTaxLine: false,
      }))
    if (state.taxEnabled && taxAmount > 0) {
      regular.push({ description: state.taxLabel || 'Tax', quantity: 1, qtyUnit: undefined, unitPrice: taxAmount, isTaxLine: true })
    }
    return regular
  }

  async function handleSave(sendAfter: boolean, mode: 'create' | 'edit', existingInvoiceId?: string) {
    if (!state.dueDate) { setSaveError('Due date is required'); return }
    const lineItemsPayload = buildLineItemsPayload()
    if (lineItemsPayload.filter(i => !i.isTaxLine).length === 0) {
      setSaveError('At least one line item is required')
      return
    }
    if (totalBelowPaid) {
      const fmtFull = (n: number, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n)
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
          body: JSON.stringify({ jobId: state.jobId || undefined, dueDate: state.dueDate, issueDate: state.issueDate || undefined, currency: state.currency, notes: state.notes || undefined, lineItems: lineItemsPayload, quoteId: props.quoteId || undefined }),
        })
        const json = await res.json()
        if (!res.ok || json.error) { setSaveError(json.error ?? 'Failed to create invoice'); return }
        invoiceId = json.data.id
        fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceDefaults: { taxEnabled: state.taxEnabled, taxLabel: state.taxLabel, taxMode: state.taxMode, taxRate: state.taxRate, currency: state.currency } }) }).catch(() => {})
      } else {
        const res = await fetch(`/api/projects/${projectId}/invoices/${existingInvoiceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: state.jobId || null, dueDate: state.dueDate, issueDate: state.issueDate || undefined, currency: state.currency, notes: state.notes || null, lineItems: lineItemsPayload }),
        })
        const json = await res.json()
        if (!res.ok || json.error) { setSaveError(json.error ?? 'Failed to update invoice'); return }
        invoiceId = existingInvoiceId!
      }
      return invoiceId
    } finally {
      setSaving(false)
    }
  }

  return {
    state,
    dispatch,
    pendingAiChanges,
    setPendingAiChanges,
    hasPendingChanges,
    subtotal,
    taxAmount,
    total,
    totalBelowPaid,
    isSent,
    isVoidOrPaid,
    paymentsExist,
    showCopyPicker,
    setShowCopyPicker,
    recentInvoices,
    loadingRecent,
    openCopyPicker,
    copyFromInvoice,
    confirmAiChanges,
    undoAiChanges,
    finalizing,
    saving,
    saveError,
    setSaveError,
    handleFinalize,
    handleSave,
    buildLineItemsPayload,
  }
}

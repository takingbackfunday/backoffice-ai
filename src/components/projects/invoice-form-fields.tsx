'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobSelect } from './job-select'
import { PaymentSummary } from '@/components/projects/payment-summary'
import type { InvoiceState, ExistingInvoice, InvoiceEditorProps, InvoiceAction, PendingAiChanges } from './hooks/use-invoice-form'
import { CURRENCIES } from './hooks/use-invoice-form'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

const fmtFull = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

interface InvoiceFormFieldsProps {
  state: InvoiceState
  dispatch: React.Dispatch<InvoiceAction>
  pendingAiChanges: PendingAiChanges
  setPendingAiChanges: React.Dispatch<React.SetStateAction<PendingAiChanges>>
  subtotal: number
  taxAmount: number
  total: number
  totalBelowPaid: boolean
  isSent: boolean
  mode: 'create' | 'edit'
  projectId: string
  jobs: InvoiceEditorProps['jobs']
  showCopyPicker: boolean
  setShowCopyPicker: (v: boolean) => void
  recentInvoices: InvoiceEditorProps['recentInvoices']
  loadingRecent: boolean
  openCopyPicker: () => void
  copyFromInvoice: (id: string) => void
  existingInvoice?: ExistingInvoice
  quoteNumber?: string
  paymentInstructions: string
  setPaymentInstructions: (v: string) => void
  paymentMethods?: PaymentMethods
}

export function InvoiceFormFields({
  state,
  dispatch,
  pendingAiChanges,
  setPendingAiChanges,
  subtotal,
  taxAmount,
  total,
  totalBelowPaid,
  isSent,
  mode,
  projectId,
  jobs,
  showCopyPicker,
  setShowCopyPicker,
  recentInvoices,
  loadingRecent,
  openCopyPicker,
  copyFromInvoice,
  existingInvoice,
  quoteNumber,
  paymentInstructions,
  setPaymentInstructions,
  paymentMethods,
}: InvoiceFormFieldsProps) {
  return (
    <>
      {/* Quote link badge */}
      {quoteNumber && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Invoice for Quote <strong>{quoteNumber}</strong>
        </div>
      )}

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
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job</label>
          <span className="text-xs text-muted-foreground italic">(Optional — for your records only)</span>
          {mode === 'create' && showCopyPicker && (
            <div className="ml-auto relative">
              <div className="absolute top-0 right-0 z-20 w-72 rounded-xl border bg-background shadow-xl p-2">
                <div className="flex items-center justify-between px-2 py-1 mb-1">
                  <span className="text-xs font-semibold">Select invoice</span>
                  <button type="button" onClick={() => setShowCopyPicker(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {loadingRecent && <p className="text-xs text-muted-foreground px-2 py-2">Loading…</p>}
                {!loadingRecent && recentInvoices && recentInvoices.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-2">No past invoices found.</p>
                )}
                {!loadingRecent && recentInvoices && recentInvoices.map(inv => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => copyFromInvoice(inv.id)}
                    className="w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className="font-medium">{inv.invoiceNumber}</span>
                    <span className="text-muted-foreground">{new Intl.NumberFormat('en-US', { style: 'currency', currency: inv.currency }).format(inv.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <JobSelect
          value={state.jobId}
          onChange={jobId => dispatch({ type: 'SET_JOB', jobId })}
          jobs={jobs}
          projectId={projectId}
          placeholder="No specific job"
          className="max-w-sm"
        />
      </div>

      {/* Tax */}
      <div className="mb-5">
        <div className="flex items-center gap-3 flex-wrap">
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
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <input
                type="text"
                value={state.taxLabel}
                onChange={e => dispatch({ type: 'SET_TAX_LABEL', label: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="GST, VAT, Sales Tax…"
              />
              <select
                value={state.taxMode}
                onChange={e => dispatch({ type: 'SET_TAX_MODE', mode: e.target.value as 'percent' | 'flat' })}
                className="rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="percent">%</option>
                <option value="flat">Flat</option>
              </select>
              <input
                type="number"
                value={state.taxRate}
                onChange={e => dispatch({ type: 'SET_TAX_RATE', rate: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-xs w-24 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums font-medium">{fmtFull(subtotal, state.currency)}</span>
          </div>
          {state.taxEnabled && taxAmount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{state.taxLabel || 'Tax'}{state.taxMode === 'percent' && state.taxRate ? ` (${state.taxRate}%)` : ''}</span>
              <span className="tabular-nums">{fmtFull(taxAmount, state.currency)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 border-t">
            <span className="text-xs font-bold">Total</span>
            <span className="text-sm font-bold tabular-nums">{fmtFull(total, state.currency)}</span>
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
            onChange={e => { dispatch({ type: 'SET_DUE_DATE', value: e.target.value }); setPendingAiChanges(p => ({ ...p, dueDate: false })) }}
            className={cn('w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow', pendingAiChanges.dueDate && 'ai-changed')}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Issue date</label>
          <input
            type="date"
            value={state.issueDate}
            onChange={e => { dispatch({ type: 'SET_ISSUE_DATE', value: e.target.value }); setPendingAiChanges(p => ({ ...p, issueDate: false })) }}
            className={cn('w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow', pendingAiChanges.issueDate && 'ai-changed')}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Currency</label>
          <select
            value={state.currency}
            onChange={e => { dispatch({ type: 'SET_CURRENCY', value: e.target.value }); setPendingAiChanges(p => ({ ...p, currency: false })) }}
            className={cn('w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow', pendingAiChanges.currency && 'ai-changed')}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes / payment terms</label>
          <Link
            href="/settings#invoice-notes-default"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Change default text →
          </Link>
          {state.aiSuggestedNotes && (
            <span className="text-[10px] text-primary flex items-center gap-1 ml-auto">
              <Sparkles className="h-3 w-3" /> AI suggested
            </span>
          )}
        </div>
        <textarea
          value={state.notes}
          onChange={e => { dispatch({ type: 'SET_NOTES', value: e.target.value }); setPendingAiChanges(p => ({ ...p, notes: false })) }}
          onBlur={e => {
            fetch('/api/preferences', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ invoiceNotesDefault: e.target.value }),
            }).catch(() => {})
          }}
          rows={3}
          className={cn('w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-shadow', pendingAiChanges.notes && 'ai-changed')}
          placeholder="Leave blank to hide from invoices"
        />
      </div>

      {/* Payment instructions */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment instructions</label>
          <Link
            href="/settings#payment-instructions"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Change default text →
          </Link>
        </div>
        <textarea
          value={paymentInstructions}
          onChange={e => setPaymentInstructions(e.target.value)}
          onBlur={e => {
            fetch('/api/preferences', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ invoicePaymentNote: e.target.value }),
            }).catch(() => {})
          }}
          rows={2}
          className="w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-shadow"
          placeholder="Leave blank to hide from invoices"
        />
        {paymentMethods && (
          <div className="mt-2">
            <PaymentSummary pm={paymentMethods} />
          </div>
        )}
      </div>
    </>
  )
}

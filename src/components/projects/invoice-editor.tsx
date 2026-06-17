'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Eye } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { LineItemsTable } from './line-items-table'
import { InvoiceFormFieldsTop, InvoiceFormFieldsBottom } from './invoice-form-fields'
import { AiConfirmBanner } from './ai-confirm-banner'
import { useInvoiceForm } from './hooks/use-invoice-form'
import type { InvoiceEditorProps } from './hooks/use-invoice-form'

export function InvoiceEditor(props: InvoiceEditorProps) {
  const { mode, projectId, projectSlug } = props
  const router = useRouter()

  const form = useInvoiceForm(props)

  const [unitPopoverId, setUnitPopoverId] = useState<string | null>(null)
  const [unitPopoverPos, setUnitPopoverPos] = useState<{ top: number; right: number } | null>(null)
  const [unitSuggestions, setUnitSuggestions] = useState<Record<string, string>>({})
  const [paymentInstructions, setPaymentInstructions] = useState(props.invoicePaymentNote ?? '')

  async function handleSave(sendAfter: boolean) {
    const invoiceId = await form.handleSave(sendAfter, mode, props.existingInvoice?.id)
    if (invoiceId) {
      router.push(`/projects/${projectSlug}/invoices/${invoiceId}${sendAfter ? '?send=1' : ''}`)
    }
  }

  return (
    <div className="flex gap-0 min-h-0">
      <div className="flex-1 min-w-0">
        <div className="pr-6">
          <InvoiceFormFieldsTop
            state={form.state}
            dispatch={form.dispatch}
            quoteNumber={props.quoteNumber}
            isSent={!!form.isSent}
            totalBelowPaid={form.totalBelowPaid}
            existingInvoice={props.existingInvoice}
            mode={mode}
            projectId={projectId}
            jobs={props.jobs}
            showCopyPicker={form.showCopyPicker}
            setShowCopyPicker={form.setShowCopyPicker}
            recentInvoices={props.recentInvoices}
            loadingRecent={form.loadingRecent}
            copyFromInvoice={form.copyFromInvoice}
          />

          <LineItemsTable
            lineItems={form.state.lineItems}
            dispatch={form.dispatch}
            currency={form.state.currency}
            mode={mode}
            projectId={projectId}
            unitPopoverId={unitPopoverId}
            setUnitPopoverId={setUnitPopoverId}
            unitPopoverPos={unitPopoverPos}
            setUnitPopoverPos={setUnitPopoverPos}
            unitSuggestions={unitSuggestions}
            setUnitSuggestions={setUnitSuggestions}
            lineItemsAiChanged={form.pendingAiChanges.lineItems}
            setPendingAiChanges={form.setPendingAiChanges}
          />

          <InvoiceFormFieldsBottom
            state={form.state}
            dispatch={form.dispatch}
            pendingAiChanges={form.pendingAiChanges}
            setPendingAiChanges={form.setPendingAiChanges}
            subtotal={form.subtotal}
            taxAmount={form.taxAmount}
            total={form.total}
            paymentInstructions={paymentInstructions}
            setPaymentInstructions={setPaymentInstructions}
            paymentMethods={props.paymentMethods}
          />

          {form.hasPendingChanges && (
            <AiConfirmBanner onConfirm={form.confirmAiChanges} onUndo={form.undoAiChanges} />
          )}

          {form.saveError && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {form.saveError}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border px-4 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={form.handleFinalize}
              disabled={form.finalizing}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {form.finalizing ? 'Reviewing…' : 'Review with AI'}
            </button>

            <button
              type="button"
              onClick={() => useChatStore.getState().toggle()}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ask AI
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={form.saving}
              className="rounded-lg border px-4 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {form.saving ? 'Saving…' : mode === 'create' ? 'Save as draft' : 'Save changes'}
            </button>

            {(!props.existingInvoice || props.existingInvoice.status === 'DRAFT') && (
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={form.saving}
                title={undefined}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                {form.saving ? 'Saving…' : 'Create & review'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

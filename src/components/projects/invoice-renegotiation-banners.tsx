'use client'

import { useState } from 'react'
import Link from 'next/link'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'

interface InvoiceRef {
  id: string
  invoiceNumber: string
}

export interface InvoiceHistoryItem {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string
  total: number
  paid: number
  currency: string
  isCurrent: boolean
}

interface Props {
  projectSlug: string
  replacesInvoice?: InvoiceRef | null
  replacedBy?: InvoiceRef | null
  historyChain: InvoiceHistoryItem[]
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

export function InvoiceRenegotiationBanners({ projectSlug, replacesInvoice, replacedBy, historyChain }: Props) {
  const [showHistory, setShowHistory] = useState(false)

  return (
    <>
      {replacedBy && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <span>⚠ This invoice was voided and replaced by</span>
          <Link href={`/projects/${projectSlug}/invoices/${replacedBy.id}`} className="font-semibold underline underline-offset-2">
            {replacedBy.invoiceNumber} →
          </Link>
        </div>
      )}
      {replacesInvoice && (
        <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2">
          <span>This invoice replaces</span>
          <Link href={`/projects/${projectSlug}/invoices/${replacesInvoice.id}`} className="font-semibold underline underline-offset-2">
            {replacesInvoice.invoiceNumber} →
          </Link>
          <span className="text-blue-500 dark:text-blue-400">(voided)</span>
        </div>
      )}

      {/* Renegotiation history panel */}
      {historyChain.length > 1 && (
        <div className="rounded-md border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            <span>History ({historyChain.length} invoices in chain)</span>
            <span className="text-muted-foreground">{showHistory ? '▲' : '▼'}</span>
          </button>
          {showHistory && (
            <div className="divide-y">
              {historyChain.map((item, i) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-xs',
                    item.isCurrent && 'bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {item.isCurrent ? (
                      <span className="font-medium">{item.invoiceNumber}</span>
                    ) : (
                      <Link href={`/projects/${projectSlug}/invoices/${item.id}`} className="font-medium hover:underline underline-offset-2">
                        {item.invoiceNumber} →
                      </Link>
                    )}
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', INVOICE_STATUS_COLORS[item.status] ?? 'bg-muted')}>{INVOICE_STATUS_LABELS[item.status] ?? item.status}</span>
                    {item.isCurrent && <span className="text-[10px] text-muted-foreground">(current)</span>}
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="text-muted-foreground">{fmt(item.total, item.currency)}</span>
                    {item.paid > 0 && <span className="text-green-700 ml-2">{fmt(item.paid, item.currency)} paid</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

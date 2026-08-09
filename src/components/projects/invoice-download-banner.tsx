'use client'

import { useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import { stashPendingMarkSentInvoice, removePendingMarkSentInvoice } from '@/lib/pending-mark-sent'

interface Props {
  projectId: string
  projectSlug: string
  invoiceId: string
  invoiceNumber: string
  clientName: string
  onDone: () => void
  onMarkSent: () => Promise<void>
}

export function InvoiceDownloadBanner({ projectId, projectSlug, invoiceId, invoiceNumber, clientName, onDone, onMarkSent }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMarkSent() {
    setSaving(true)
    setError(null)
    try {
      await onMarkSent()
      removePendingMarkSentInvoice(invoiceId)
      onDone()
    } catch {
      setError('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function handleNotYet() {
    stashPendingMarkSentInvoice({
      invoiceId,
      invoiceNumber,
      projectId,
      projectSlug,
      downloadedAt: Date.now(),
    })
    onDone()
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3">
      <Download className="w-4 h-4 text-blue-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-blue-900">
          PDF downloaded ✓ — attach it to an email to {clientName}. Once it&apos;s sent, mark it sent so your pipeline stays accurate.
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleMarkSent}
          disabled={saving}
          className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Mark as sent
        </button>
        <button
          onClick={handleNotYet}
          disabled={saving}
          className="rounded-md border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
        >
          Not yet
        </button>
      </div>
    </div>
  )
}

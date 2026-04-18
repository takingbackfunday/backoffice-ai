'use client'

import { useEffect, useRef, useState } from 'react'

interface PendingItem {
  invoiceId: string
  invoiceNumber: string
  projectId: string
  projectSlug: string
  downloadedAt: number
}

interface Props {
  item: PendingItem
  onDone: () => void
}

export function MarkSentModal({ item, onDone }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const readyRef = useRef(false)

  // Prevent click-through on the very click that opened the modal
  useEffect(() => {
    const t = setTimeout(() => { readyRef.current = true }, 120)
    return () => clearTimeout(t)
  }, [])

  async function handleMarkSent() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${item.projectId}/invoices/${item.invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SENT' }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to update invoice')
        return
      }
      removePending()
      onDone()
    } catch {
      setError('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function handleIgnore() {
    removePending()
    onDone()
  }

  function removePending() {
    try {
      const key = 'pending-mark-sent'
      const existing: PendingItem[] = JSON.parse(localStorage.getItem(key) ?? '[]')
      localStorage.setItem(key, JSON.stringify(existing.filter(e => e.invoiceId !== item.invoiceId)))
    } catch {}
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && readyRef.current) handleIgnore() }}
    >
      <div className="w-full max-w-md bg-background rounded-2xl shadow-2xl border overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Invoice downloaded</p>
          <h2 className="text-base font-semibold">{item.invoiceNumber}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm font-medium">Was this invoice sent to your client?</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Marking it as sent moves it into your <span className="font-medium text-foreground">Outstanding</span> balance
            and starts the payment tracking clock. If you emailed it yourself outside Backoffice, mark it as sent so your
            numbers stay accurate.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={handleMarkSent}
            disabled={saving}
            className="flex-1 rounded-lg bg-[#3C3489] py-2 text-sm font-semibold text-white hover:bg-[#2d2770] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Yes, mark as sent'}
          </button>
          <button
            onClick={handleIgnore}
            disabled={saving}
            className="flex-1 rounded-lg border py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
          >
            Not yet, ignore
          </button>
        </div>
      </div>
    </div>
  )
}

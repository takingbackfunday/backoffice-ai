'use client'

import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onSend: (message: string) => void
  saving: boolean
  error: string | null
  clientEmail: string | null
}

export function QuoteSendEmailModal({ open, onClose, onSend, saving, error, clientEmail }: Props) {
  const [message, setMessage] = useState('')

  if (!open) return null
  const disabled = saving || !clientEmail

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-5 space-y-4">
        <h3 className="text-base font-semibold">Send by email</h3>
        {!clientEmail && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
            Add a client email address to send directly.
          </p>
        )}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Message (optional)</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Hi, please find attached quote…"
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSend(message)}
            disabled={disabled}
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Sending…' : 'Send email'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

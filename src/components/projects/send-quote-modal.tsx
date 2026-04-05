'use client'

import { useState } from 'react'
import { X, Send, Loader2 } from 'lucide-react'

interface Props {
  projectId: string
  quoteId: string
  quoteNumber: string
  recipientEmail: string | null
  onClose: () => void
  onSent: () => void
}

export function SendQuoteModal({ projectId, quoteId, quoteNumber, recipientEmail, onClose, onSent }: Props) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes/${quoteId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to send'); return }
      onSent()
    } catch {
      setError('Failed to send quote')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">Send Quote {quoteNumber}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {recipientEmail ? (
            <div>
              <p className="text-xs text-muted-foreground">To</p>
              <p className="text-sm mt-0.5">{recipientEmail}</p>
            </div>
          ) : (
            <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              No client email address on file. Add an email to the client profile to send quotes.
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground">Message (optional)</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Hi, please find your quote attached…"
              rows={4}
              className="mt-1 w-full text-sm border rounded p-2 bg-background resize-none"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            The quote PDF will be attached automatically.
          </p>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button onClick={onClose} className="text-sm px-4 py-1.5 rounded border hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !recipientEmail}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending ? 'Sending…' : 'Send Quote'}
          </button>
        </div>
      </div>
    </div>
  )
}

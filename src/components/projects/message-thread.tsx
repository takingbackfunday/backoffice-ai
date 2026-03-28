'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  senderRole: string
  body: string
  createdAt: string
  isRead: boolean
}

interface Props {
  projectId: string
  unitId: string
  tenantId: string
  tenantName: string
  initialMessages: Message[]
}

function fmtDate(d: string) {
  const date = new Date(d)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function MessageThread({ projectId, unitId, tenantId, tenantName, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/messages?tenantId=${tenantId}&unitId=${unitId}`)
        if (res.ok) {
          const json = await res.json()
          if (!json.error) setMessages(json.data)
        }
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [projectId, tenantId, unitId])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, unitId, body: body.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send'); return }
      setMessages(prev => [...prev, json.data])
      setBody('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-1">
      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No messages yet. Send a message to start the conversation with {tenantName}.
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {messages.map(msg => (
            <div key={msg.id} className={cn('px-5 py-4', msg.senderRole === 'owner' && 'bg-muted/20')}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {msg.senderRole === 'owner' ? 'You' : tenantName}
                </span>
                <span className="text-xs text-muted-foreground">{fmtDate(msg.createdAt)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="pt-4 space-y-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={`Reply to ${tenantName}…`}
          rows={4}
          className="w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          disabled={sending}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </form>
    </div>
  )
}

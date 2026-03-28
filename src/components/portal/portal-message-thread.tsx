'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  senderRole: string
  subject: string | null
  body: string
  createdAt: string
}

interface Props {
  tenantId?: string
  unitId: string
  projectId?: string
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

export function PortalMessageThread({ unitId, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill subject as reply if there are existing messages
  const lastSubject = messages.findLast(m => m.subject)?.subject ?? null

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/portal/messages?unitId=${unitId}`)
        if (res.ok) {
          const json = await res.json()
          if (!json.error) setMessages(json.data)
        }
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [unitId])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    setError(null)
    try {
      const replySubject = subject.trim() || (lastSubject ? `Re: ${lastSubject}` : null)
      const res = await fetch('/api/portal/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, subject: replySubject, body: body.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send'); return }
      setMessages(prev => [...prev, json.data])
      setBody('')
      setSubject('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No messages yet. Send a message below to start the conversation.
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {messages.map(msg => (
            <div key={msg.id} className={cn('px-5 py-4', msg.senderRole === 'tenant' && 'bg-muted/20')}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {msg.senderRole === 'tenant' ? 'You' : 'Your landlord'}
                </span>
                <span className="text-xs text-muted-foreground">{fmtDate(msg.createdAt)}</span>
              </div>
              {msg.subject && (
                <p className="text-sm font-medium mb-1">{msg.subject}</p>
              )}
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{msg.body}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="space-y-2">
        {messages.length === 0 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="What's this about?"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write a message…"
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

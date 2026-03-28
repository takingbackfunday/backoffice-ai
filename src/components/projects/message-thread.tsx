'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  senderRole: string
  subject: string | null
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
  const [showCompose, setShowCompose] = useState(false)
  const [subject, setSubject] = useState('')
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
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, unitId, subject: subject.trim(), body: body.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send'); return }
      setMessages(prev => [...prev, json.data])
      setSubject('')
      setBody('')
      setShowCompose(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCompose(v => !v)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New message
        </button>
      </div>

      {showCompose && (
        <form onSubmit={handleSend} className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">New message to {tenantName}</h3>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Rent reminder for March"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={4}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowCompose(false); setError(null) }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !subject.trim() || !body.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}

      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No messages yet. Send a message to start the conversation with {tenantName}.
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {messages.map(msg => (
            <div key={msg.id} className={cn('px-5 py-4', msg.senderRole === 'owner' && 'bg-muted/20')}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {msg.senderRole === 'owner' ? 'You' : tenantName}
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
    </div>
  )
}

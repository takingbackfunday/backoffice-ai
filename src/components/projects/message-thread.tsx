'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  senderRole: string
  subject: string | null
  body: string
  createdAt: string
  isRead: boolean
}

interface Thread {
  subject: string
  messages: Message[]
  lastAt: string
  unreadCount: number
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

function groupIntoThreads(messages: Message[]): Thread[] {
  const map = new Map<string, Message[]>()
  for (const msg of messages) {
    const key = (msg.subject ?? '').trim() || '(no subject)'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(msg)
  }
  return Array.from(map.entries())
    .map(([subject, msgs]) => {
      const sorted = [...msgs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      return {
        subject,
        messages: sorted,
        lastAt: sorted[sorted.length - 1].createdAt,
        unreadCount: sorted.filter(m => !m.isRead && m.senderRole !== 'owner').length,
      }
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

export function MessageThread({ projectId, unitId, tenantId, tenantName, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [openThread, setOpenThread] = useState<string | null>(() => {
    // Auto-open the most recent thread
    const threads = groupIntoThreads(initialMessages)
    return threads[0]?.subject ?? null
  })
  const [showCompose, setShowCompose] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Per-thread reply state
  const [replyBody, setReplyBody] = useState<Record<string, string>>({})
  const [replySending, setReplySending] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<Record<string, string>>({})
  const bottomRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const threads = groupIntoThreads(messages)

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

  // Scroll to bottom of open thread when messages update
  useEffect(() => {
    if (openThread && bottomRefs.current[openThread]) {
      bottomRefs.current[openThread]!.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, openThread])

  async function handleNewThread(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubject.trim() || !newBody.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, unitId, subject: newSubject.trim(), body: newBody.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send'); return }
      setMessages(prev => [...prev, json.data])
      setOpenThread(newSubject.trim())
      setNewSubject('')
      setNewBody('')
      setShowCompose(false)
    } finally {
      setSending(false)
    }
  }

  async function handleReply(subject: string) {
    const body = replyBody[subject]?.trim()
    if (!body) return
    setReplySending(subject)
    setReplyError(prev => ({ ...prev, [subject]: '' }))
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, unitId, subject, body }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setReplyError(prev => ({ ...prev, [subject]: json.error ?? 'Failed to send' }))
        return
      }
      setMessages(prev => [...prev, json.data])
      setReplyBody(prev => ({ ...prev, [subject]: '' }))
    } finally {
      setReplySending(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted-foreground">
          {threads.length} conversation{threads.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={() => { setShowCompose(v => !v); setError(null) }}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New conversation
        </button>
      </div>

      {/* New conversation compose form */}
      {showCompose && (
        <form onSubmit={handleNewThread} className="rounded-lg border p-4 space-y-3 bg-muted/10">
          <h3 className="text-sm font-semibold">Start new conversation with {tenantName}</h3>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <input
              type="text"
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
              placeholder="e.g. Rent reminder for March"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea
              value={newBody}
              onChange={e => setNewBody(e.target.value)}
              placeholder="Write your message…"
              rows={3}
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
              disabled={sending || !newSubject.trim() || !newBody.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}

      {/* Thread list */}
      {threads.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No messages yet. Start a conversation with {tenantName}.
        </div>
      ) : (
        <div className="rounded-lg border divide-y overflow-hidden">
          {threads.map(thread => {
            const isOpen = openThread === thread.subject
            const lastMsg = thread.messages[thread.messages.length - 1]
            return (
              <div key={thread.subject}>
                {/* Thread header — click to expand/collapse */}
                <button
                  type="button"
                  onClick={() => setOpenThread(isOpen ? null : thread.subject)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors',
                    isOpen && 'bg-muted/20'
                  )}
                >
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className={cn('flex-1 text-sm font-medium truncate', thread.unreadCount > 0 && 'font-semibold')}>
                    {thread.subject}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {thread.unreadCount > 0 && (
                      <span className="rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 font-semibold leading-none">
                        {thread.unreadCount}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{fmtDate(thread.lastAt)}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{thread.messages.length} msg{thread.messages.length !== 1 ? 's' : ''}</span>
                  </div>
                </button>

                {/* Expanded thread messages + reply */}
                {isOpen && (
                  <div className="border-t bg-background">
                    {/* Message bubbles */}
                    <div className="px-4 py-3 space-y-3 max-h-80 overflow-y-auto">
                      {thread.messages.map(msg => {
                        const isOwner = msg.senderRole === 'owner'
                        return (
                          <div key={msg.id} className={cn('flex', isOwner ? 'justify-end' : 'justify-start')}>
                            <div className={cn(
                              'max-w-[75%] rounded-2xl px-4 py-2.5',
                              isOwner
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-muted text-foreground rounded-bl-sm'
                            )}>
                              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                              <p className={cn(
                                'text-xs mt-1',
                                isOwner ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground'
                              )}>
                                {isOwner ? 'You' : tenantName} · {fmtDate(msg.createdAt)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                      <div ref={el => { bottomRefs.current[thread.subject] = el }} />
                    </div>

                    {/* Reply box */}
                    <div className="border-t px-4 py-3">
                      <div className="flex gap-2 items-end">
                        <textarea
                          value={replyBody[thread.subject] ?? ''}
                          onChange={e => setReplyBody(prev => ({ ...prev, [thread.subject]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleReply(thread.subject)
                            }
                          }}
                          placeholder={`Reply to "${thread.subject}"…`}
                          rows={1}
                          className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        />
                        <button
                          type="button"
                          disabled={!replyBody[thread.subject]?.trim() || replySending === thread.subject}
                          onClick={() => handleReply(thread.subject)}
                          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {replySending === thread.subject ? 'Sending…' : 'Send'}
                        </button>
                      </div>
                      {replyError[thread.subject] && (
                        <p className="text-xs text-destructive mt-1">{replyError[thread.subject]}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

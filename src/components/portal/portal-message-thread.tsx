'use client'

import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  senderRole: string
  body: string
  createdAt: string
}

interface Props {
  tenantId?: string
  unitId: string
  projectId?: string
  initialMessages: Message[]
}

export function PortalMessageThread({ tenantId: _tenantId, unitId, projectId: _projectId, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/portal/messages?unitId=${unitId}`)
        if (res.ok) {
          const json = await res.json()
          if (!json.error) setMessages(json.data)
        }
      } catch {
        // Ignore polling errors silently
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [unitId])

  async function handleSend() {
    if (!body.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/portal/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, body }),
      })
      const json = await res.json()
      if (res.ok && !json.error) {
        setMessages(prev => [...prev, json.data])
        setBody('')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-lg border flex flex-col" style={{ height: '480px' }}>
      <div className="border-b px-4 py-2">
        <p className="text-xs text-muted-foreground">Messages with your landlord</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No messages yet. Send a message to your landlord.</p>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={cn('flex', msg.senderRole === 'tenant' ? 'justify-end' : 'justify-start')}
            >
              <div className={cn(
                'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                msg.senderRole === 'tenant'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              )}>
                <p>{msg.body}</p>
                <p className={cn(
                  'text-xs mt-1 opacity-70',
                  msg.senderRole === 'tenant' ? 'text-right' : 'text-left'
                )}>
                  {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex items-center gap-2">
        <input
          type="text"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Type a message…"
          className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={sending}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

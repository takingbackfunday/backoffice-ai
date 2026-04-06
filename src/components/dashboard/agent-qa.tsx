'use client'

import { useRef, useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import type { AgentDomain } from '@/lib/agent/types'

type Status = 'idle' | 'running' | 'done' | 'error'

const EXAMPLE_QUESTIONS = [
  'Give me a financial snapshot — income, expenses, top categories, and any patterns worth noting.',
  'What did I spend the most on last month?',
  'Which payee costs me the most overall?',
  'Do I have any overdue tenants?',
  'What is my current portfolio occupancy?',
]

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function AgentQA() {
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const esRef = useRef<AbortController | null>(null)

  const { sessionId, turns, addTurn, clearHistory, pendingMessage, clearPendingMessage } = useChatStore()

  // Auto-submit a pending message (e.g. triggered from another page)
  useEffect(() => {
    if (pendingMessage) {
      clearPendingMessage()
      ask(pendingMessage)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cancel() {
    esRef.current?.abort()
    esRef.current = null
    setStatus('idle')
    setStatusMsg('')
  }

  function ask(q?: string) {
    const q_ = (q ?? question).trim()
    if (!q_) return
    if (q) setQuestion(q)

    cancel()
    setError('')
    setStatus('running')
    setStatusMsg('')

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: 'user', content: q_ }])

    const ac = new AbortController()
    esRef.current = ac

    fetch('/api/agent/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q_,
        conversationHistory: turns,
        sessionId,
      }),
      signal: ac.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        setStatus('error')
        setError('Failed to reach the agent.')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let lastAnswer = ''
      let detectedDomain: AgentDomain | 'cross-domain' = 'finance'

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'status') setStatusMsg(event.message ?? '')
            if (event.type === 'answer') lastAnswer = event.answer ?? ''
            if (event.type === 'session' && event.sessionId) {
              // detect domain from status messages is approximate — default to cross-domain for multi-agent
              detectedDomain = 'cross-domain'
            }
            if (event.type === 'done') {
              setStatus('done')
              if (lastAnswer) {
                setMessages((prev) => [...prev, { role: 'assistant', content: lastAnswer }])
                addTurn('user', q_, detectedDomain)
                addTurn('assistant', lastAnswer, detectedDomain)
              }
            }
            if (event.type === 'error') {
              setError(event.error ?? 'Error')
              setStatus('error')
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    }).catch((err) => {
      if (err.name === 'AbortError') return
      setStatus('error')
      setError('Connection failed.')
    })

    setQuestion('')
  }

  function handleClear() {
    cancel()
    setMessages([])
    setError('')
    setStatus('idle')
    clearHistory()
  }

  const showHistory = messages.length > 0

  return (
    <div className="rounded-lg border bg-white p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Ask AI</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">Ask about your finances or properties</p>
        </div>
        {showHistory && (
          <button
            onClick={handleClear}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Conversation history */}
      {showHistory && (
        <div className="mb-4 space-y-3 max-h-80 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'text-[12px] bg-[#3C3489] text-white rounded-xl rounded-br-sm px-3 py-2 max-w-[85%]'
                    : 'text-[11px] font-mono bg-[#1a1a2e] text-[#a8d8a8] rounded-xl rounded-bl-sm px-3 py-2 max-w-[90%] whitespace-pre-wrap leading-relaxed'
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {status === 'running' && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl rounded-bl-sm px-3 py-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-[#534AB7] border-t-transparent animate-spin shrink-0" />
                {statusMsg || 'Working…'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && status !== 'running') ask() }}
          placeholder="e.g. What did I spend the most on last month?"
          disabled={status === 'running'}
          className="flex-1 text-xs border border-black/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30 disabled:opacity-50 disabled:bg-muted/30"
        />
        {status !== 'running' ? (
          <button
            onClick={() => ask()}
            disabled={!question.trim()}
            className="text-xs px-4 py-2 rounded-lg bg-[#3C3489] text-[#EEEDFE] hover:bg-[#2d2770] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            Ask
          </button>
        ) : (
          <button
            onClick={cancel}
            className="text-xs px-4 py-2 rounded-lg border border-black/15 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Example questions — only when no history */}
      {!showHistory && status === 'idle' && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              className="text-[11px] text-[#534AB7] border border-[#534AB7]/20 bg-[#EEEDFE]/50 rounded-full px-2.5 py-1 hover:bg-[#EEEDFE] transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="mt-3 text-xs text-red-600">
          {error}
          <button onClick={() => setStatus('idle')} className="ml-2 underline">Try again</button>
        </div>
      )}
    </div>
  )
}

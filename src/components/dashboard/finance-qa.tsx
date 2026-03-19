'use client'

import { useRef, useState } from 'react'

type Status = 'idle' | 'running' | 'done' | 'error'

const EXAMPLE_QUESTIONS = [
  'Give me a financial snapshot — income, expenses, top categories, and any patterns worth noting.',
  'What did I spend the most on last month?',
  'Which payee costs me the most overall?',
  'What is my average monthly spend?',
  'How much have I spent on groceries?',
]

export function FinanceQA() {
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const esRef = useRef<EventSource | null>(null)

  function reset() {
    esRef.current?.close()
    esRef.current = null
    setStatus('idle')
    setStatusMsg('')
    setAnswer('')
    setError('')
  }

  function ask(q?: string) {
    const q_ = (q ?? question).trim()
    if (!q_) return
    if (q) setQuestion(q)

    reset()
    setStatus('running')

    // We need POST + SSE — use fetch + ReadableStream reader
    fetch('/api/agent/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q_ }),
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        setStatus('error')
        setError('Failed to reach the agent.')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

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
            if (event.type === 'answer') setAnswer(event.answer ?? '')
            if (event.type === 'done') setStatus('done')
            if (event.type === 'error') { setError(event.error ?? 'Error'); setStatus('error') }
          } catch {
            // ignore malformed lines
          }
        }
      }
    }).catch(() => {
      setStatus('error')
      setError('Connection failed.')
    })
  }

  return (
    <div className="rounded-lg border bg-white p-5">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">Ask about your finances</h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">Ask any question and the AI will answer using your data</p>
      </div>

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
        {status === 'idle' || status === 'done' || status === 'error' ? (
          <button
            onClick={() => ask()}
            disabled={!question.trim()}
            className="text-xs px-4 py-2 rounded-lg bg-[#3C3489] text-[#EEEDFE] hover:bg-[#2d2770] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            Ask
          </button>
        ) : (
          <button
            onClick={reset}
            className="text-xs px-4 py-2 rounded-lg border border-black/15 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Example questions */}
      {status === 'idle' && (
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

      {/* Running state */}
      {status === 'running' && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[#534AB7] border-t-transparent animate-spin shrink-0" />
          {statusMsg || 'Working…'}
        </div>
      )}

      {/* Answer */}
      {(status === 'done' || (status === 'running' && answer)) && answer && (
        <div className="mt-4">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-[#1a1a2e] text-[#a8d8a8] rounded-lg px-4 py-3 overflow-x-auto">
            {answer}
          </pre>
          {status === 'done' && (
            <button
              onClick={() => { reset(); setQuestion('') }}
              className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              ← Ask another question
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="mt-4 text-xs text-red-600">
          {error}
          <button onClick={reset} className="ml-2 underline">Try again</button>
        </div>
      )}
    </div>
  )
}

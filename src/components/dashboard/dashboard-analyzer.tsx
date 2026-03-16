'use client'

import { useRef, useState } from 'react'

export function DashboardAnalyzer() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [statusMessages, setStatusMessages] = useState<string[]>([])
  const [report, setReport] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  function run() {
    if (esRef.current) esRef.current.close()
    setStatus('running')
    setStatusMessages([])
    setReport(null)

    const es = new EventSource('/api/agent/analyze')
    esRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)
      if (event.type === 'status') {
        setStatusMessages((prev) => [...prev, event.message])
      } else if (event.type === 'report') {
        setReport(event.report)
      } else if (event.type === 'done') {
        setStatus('done')
        es.close()
      } else if (event.type === 'error') {
        setStatusMessages((prev) => [...prev, `Error: ${event.error}`])
        setStatus('error')
        es.close()
      }
    }

    es.onerror = () => {
      setStatusMessages((prev) => [...prev, 'Connection error'])
      setStatus('error')
      es.close()
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Agent analysis</p>
        <button
          onClick={run}
          disabled={status === 'running'}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {status === 'running' ? 'Analysing…' : status === 'done' ? 'Re-analyse' : 'Analyse'}
        </button>
      </div>

      {/* Status ticks */}
      {statusMessages.length > 0 && (
        <div className="space-y-0.5">
          {statusMessages.map((msg, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="text-green-500">✓</span>{msg}
            </p>
          ))}
          {status === 'running' && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="animate-pulse">●</span> Working…
            </p>
          )}
        </div>
      )}

      {/* Report output */}
      {report && (
        <pre className="rounded border bg-zinc-950 text-zinc-100 text-xs p-4 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-80">
          {report}
        </pre>
      )}

      {status === 'idle' && (
        <p className="text-xs text-muted-foreground">
          Get a terse AI summary of your transactions, spending patterns, and coverage gaps.
        </p>
      )}
    </div>
  )
}

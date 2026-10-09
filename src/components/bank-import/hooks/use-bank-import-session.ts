'use client'

import { useEffect, useRef, useState } from 'react'
import type { BankImportStatusValue, BankImportCommandType } from '@/lib/bank-import/status'
import { statusCopy } from '@/lib/bank-import/status-copy'

export interface SessionSnapshot {
  id: string
  status: BankImportStatusValue
  needsUserReason: string | null
  bankKey: string
  bankName: string
  accountId: string
  accountName: string
  dateFrom: string
  dateTo: string
  errorCode: string | null
  errorMessage: string | null
  hasLiveView: boolean
  artifacts: { id: string; filename: string; mimeType: string; sizeBytes: number; purged: boolean }[]
  createdAt: string
  startedAt: string | null
  capturedAt: string | null
  updatedAt: string
}

export interface SessionEvent {
  id: number
  type: string
  message: string
  data: Record<string, unknown>
  createdAt: string
}

export function useBankImportSession(id: string) {
  const [sessionState, setSessionState] = useState<{
    id: string
    snapshot: SessionSnapshot | null
    events: SessionEvent[]
    error: string | null
  }>(() => ({ id, snapshot: null, events: [], error: null }))
  const [liveView, setLiveView] = useState<{ id: string; url: string }>({ id: '', url: '' })
  const [now, setNow] = useState(0)
  const lastAttentionKey = useRef('')
  const current = sessionState.id === id ? sessionState : { id, snapshot: null, events: [], error: null }
  const snapshot = current.snapshot
  const events = current.events
  const error = current.error
  const liveUrl = snapshot?.hasLiveView && liveView.id === id ? liveView.url : null
  const queuedForMs = snapshot?.status === 'QUEUED'
    ? Math.max(0, now - new Date(snapshot.createdAt).getTime())
    : 0

  useEffect(() => {
    let cancelled = false
    const seen = new Set<number>()
    const eventSource = new EventSource(`/api/bank-import/sessions/${encodeURIComponent(id)}/events`)
    eventSource.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as { type: string; event?: SessionEvent; session?: SessionSnapshot }
        if (payload.type === 'end') {
          eventSource.close()
        } else if (payload.type === 'event' && payload.event && !seen.has(payload.event.id)) {
          seen.add(payload.event.id)
          setSessionState((previous) => {
            const base = previous.id === id ? previous : { id, snapshot: null, events: [], error: null }
            return { ...base, events: [...base.events, payload.event!] }
          })
        } else if (payload.type === 'snapshot' && payload.session) {
          setSessionState((previous) => {
            const base = previous.id === id ? previous : { id, snapshot: null, events: [], error: null }
            return { ...base, snapshot: payload.session! }
          })
        }
      } catch {
        setSessionState((previous) => {
          const base = previous.id === id ? previous : { id, snapshot: null, events: [], error: null }
          return { ...base, error: 'Could not read the import session update.' }
        })
      }
    }
    eventSource.onerror = () => {
      if (!cancelled && eventSource.readyState === EventSource.CLOSED) {
        setSessionState((previous) => {
          const base = previous.id === id ? previous : { id, snapshot: null, events: [], error: null }
          return { ...base, error: 'The session updates disconnected. Reopen this session to reconnect.' }
        })
      }
    }
    void fetch(`/api/bank-import/sessions/${encodeURIComponent(id)}`)
      .then(async (response) => {
        const json = await response.json()
        if (!response.ok || json.error) throw new Error(json.error ?? 'Could not load the import session.')
        if (!cancelled) setSessionState((previous) => {
          const base = previous.id === id ? previous : { id, snapshot: null, events: [], error: null }
          return { ...base, snapshot: json.data as SessionSnapshot }
        })
      })
      .catch((cause) => {
        if (!cancelled) setSessionState((previous) => {
          const base = previous.id === id ? previous : { id, snapshot: null, events: [], error: null }
          return { ...base, error: cause instanceof Error ? cause.message : 'Could not load the import session.' }
        })
      })
    return () => {
      cancelled = true
      eventSource.close()
    }
  }, [id])

  useEffect(() => {
    if (!snapshot?.hasLiveView) return
    const controller = new AbortController()
    void fetch(`/api/bank-import/sessions/${encodeURIComponent(id)}/live-view`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json()
        if (!response.ok || json.error) throw new Error(json.error ?? 'Live view is not available.')
        if (!controller.signal.aborted) setLiveView({ id, url: json.data.url as string })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [id, snapshot?.hasLiveView])

  useEffect(() => {
    if (snapshot?.status !== 'QUEUED') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [snapshot?.status, snapshot?.createdAt])

  const attentionStatus = snapshot?.status
  const attentionReason = snapshot?.needsUserReason
  const attentionBank = snapshot?.bankName
  const attentionError = snapshot?.errorMessage
  useEffect(() => {
    if (!attentionStatus || !['AWAITING_LOGIN', 'NEEDS_USER'].includes(attentionStatus)) {
      lastAttentionKey.current = ''
      return
    }
    const attentionKey = `${attentionStatus}:${attentionReason ?? ''}`
    if (attentionKey === lastAttentionKey.current) return
    lastAttentionKey.current = attentionKey
    if (!document.hidden) return
    const originalTitle = document.title
    let flash = false
    const timer = setInterval(() => {
      flash = !flash
      document.title = flash ? '(!) Action needed — Backoffice' : originalTitle
    }, 1000)
    const onVisibility = () => { if (!document.hidden) document.title = originalTitle }
    document.addEventListener('visibilitychange', onVisibility)
    if ('Notification' in window && Notification.permission === 'granted') {
      const copy = statusCopy({
        status: attentionStatus,
        needsUserReason: attentionReason ?? null,
        bankName: attentionBank ?? 'your bank',
        queuedForMs: 0,
        errorMessage: attentionError ?? null,
      })
      new Notification('Your bank needs you', { body: copy.title })
    }
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      document.title = originalTitle
    }
  }, [attentionStatus, attentionReason, attentionBank, attentionError])

  async function send(type: BankImportCommandType): Promise<void> {
    const response = await fetch(`/api/bank-import/sessions/${encodeURIComponent(id)}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    const json = await response.json()
    if (!response.ok || json.error) throw new Error(json.error ?? 'Could not send the instruction.')
  }

  return { snapshot, events, error, liveUrl, queuedForMs, send }
}

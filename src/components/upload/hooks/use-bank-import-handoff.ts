'use client'

import { useEffect, useRef, useState } from 'react'
import { resetUploadDropzone } from '@/stores/upload-dropzone-store'
import { useUploadStore } from '@/stores/upload-store'
import type { UploadFile } from '@/types'
import { useIngestFiles } from './use-ingest-files'

interface HandoffResponse {
  accountId: string
  bankName: string
  files: UploadFile[]
  unsupported: { artifactId: string; filename: string; reason: string; original: Extract<NonNullable<UploadFile['original']>, { kind: 'bank' }> }[]
}

export function useBankImportHandoff(sessionId: string | null): {
  state: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  bankName: string | null
  unsupported: HandoffResponse['unsupported']
  reset: () => void
} {
  const ingest = useIngestFiles()
  const lastImport = useUploadStore((s) => s.lastImport)
  const completedSessionRef = useRef<string | null>(null)
  const readySessionRef = useRef<string | null>(null)
  const cancelHandoffRef = useRef<(() => void) | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(sessionId ? 'loading' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [bankName, setBankName] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState<HandoffResponse['unsupported']>([])

  useEffect(() => {
    readySessionRef.current = null
    if (!sessionId) {
      setState('idle')
      setError(null)
      setBankName(null)
      setUnsupported([])
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const cancel = () => { cancelled = true; controller.abort() }
    cancelHandoffRef.current = cancel
    setState('loading')
    setError(null)
    useUploadStore.getState().reset()
    resetUploadDropzone()

    void (async () => {
      try {
        const response = await fetch(`/api/bank-import/sessions/${encodeURIComponent(sessionId)}/files`, { signal: controller.signal, cache: 'no-store' })
        const json = await response.json()
        if (!response.ok || json.error) throw new Error(json.error ?? 'Could not load the bank download.')
        const data = json.data as HandoffResponse
        if (cancelled) return
        setBankName(data.bankName)
        setUnsupported(data.unsupported)
        useUploadStore.getState().setAccountId(data.accountId)
        if (data.files.length === 0) throw new Error('No usable file was captured.')
        await ingest(data.files, [], controller.signal)
        if (cancelled) return
        if (!data.files.some((file) => useUploadStore.getState().files.includes(file))) {
          setState('idle')
          return
        }
        useUploadStore.getState().setAccountId(data.accountId)
        readySessionRef.current = sessionId
        setState('ready')
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Could not load the bank download.')
        setState('error')
      }
    })()

    return () => {
      cancel()
      if (cancelHandoffRef.current === cancel) cancelHandoffRef.current = null
    }
  }, [sessionId, ingest])

  useEffect(() => {
    if (!sessionId || readySessionRef.current !== sessionId || state !== 'ready' || !lastImport || completedSessionRef.current === sessionId) return
    completedSessionRef.current = sessionId
    void fetch(`/api/bank-import/sessions/${encodeURIComponent(sessionId)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imported: lastImport.imported, skipped: lastImport.skipped }),
    }).catch(() => {})
  }, [sessionId, state, lastImport])

  function reset() {
    // Stop late responses immediately; a router transition may not commit yet.
    cancelHandoffRef.current?.()
    readySessionRef.current = null
    setState('idle')
    setError(null)
    setBankName(null)
    setUnsupported([])
  }

  return { state, error, bankName, unsupported, reset }
}

import { useState, useRef, useCallback } from 'react'

export function usePendingAiChanges<T>() {
  const snapshotRef = useRef<T | null>(null)
  const [pendingFields, setPendingFields] = useState<ReadonlySet<string>>(new Set())

  const markPending = useCallback((field: string, currentSnapshot: T) => {
    if (!snapshotRef.current) snapshotRef.current = currentSnapshot
    setPendingFields(prev => new Set([...prev, field]))
  }, [])

  const confirm = useCallback(() => {
    setPendingFields(new Set())
    snapshotRef.current = null
  }, [])

  const undo = useCallback((apply: (snapshot: T) => void) => {
    if (snapshotRef.current) apply(snapshotRef.current)
    setPendingFields(new Set())
    snapshotRef.current = null
  }, [])

  return {
    pendingFields,
    hasPendingChanges: pendingFields.size > 0,
    markPending,
    confirm,
    undo,
  }
}

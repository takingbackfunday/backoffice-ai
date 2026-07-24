'use client'

import { useEffect, useRef, useState } from 'react'
import type { Payee } from '@/components/rules/rule-editor'
import type { PayeeDraftHandle } from '../cells/payee-cell'
import type { EditableField } from './use-inline-edit'

/** Insert a payee sorted-by-name, or replace it in place when already present. */
export function upsertPayee(list: Payee[], p: Payee): Payee[] {
  const exists = list.some((x) => x.id === p.id)
  const next = exists ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]
  return next.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Owns the "Create payee 'X'?" prompt for one row: registers an exit guard
 * with use-inline-edit so any exit attempt (Done, Enter, Escape, click-away)
 * with an unmatched payee draft opens the prompt instead of silently dropping
 * the typed name.
 */
export function usePayeeCreatePrompt({
  rowId,
  isRowEditing,
  payeeExitGuardRef,
  setPayees,
  commitEdit,
  exitRowEdit,
}: {
  rowId: string
  isRowEditing: boolean
  payeeExitGuardRef: React.RefObject<((rowId: string) => boolean) | null>
  setPayees: React.Dispatch<React.SetStateAction<Payee[]>>
  commitEdit: (id: string, field: EditableField, rawValue: string | null, freshPayee?: Payee) => void
  exitRowEdit: (id: string, opts?: { force?: boolean }) => void
}) {
  const payeeDraftRef = useRef<PayeeDraftHandle | null>(null)
  const payeeAnchorRef = useRef<HTMLTableCellElement>(null)
  const [promptName, setPromptName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only the editing row registers a guard; it unregisters on exit/unmount.
  useEffect(() => {
    if (!isRowEditing) return
    const guardRef = payeeExitGuardRef
    guardRef.current = (id) => {
      if (id !== rowId) return false
      const draft = payeeDraftRef.current?.getUnmatched() ?? null
      if (!draft) return false
      setError(null)
      setPromptName(draft)
      return true
    }
    return () => { guardRef.current = null }
  }, [isRowEditing, payeeExitGuardRef, rowId])

  function commitPayeeAndExit(p: Payee) {
    setPayees((prev) => upsertPayee(prev, p))
    commitEdit(rowId, 'payeeId', p.id, p)
    setPromptName(null)
    exitRowEdit(rowId, { force: true })
  }

  async function handleCreate() {
    const name = promptName?.trim()
    if (!name || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/payees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json().catch(() => null)
      // 409 — a case-variant already exists server-side: select it instead of duplicating.
      if (res.status === 409 && json?.data?.id) {
        commitPayeeAndExit({ id: json.data.id, name: json.data.name })
        return
      }
      if (!res.ok || !json?.data?.id) {
        setError(json?.error ?? 'Failed to create payee')
        setBusy(false)
        return
      }
      commitPayeeAndExit({ id: json.data.id, name: json.data.name })
    } catch {
      setError('Failed to create payee')
      setBusy(false)
    }
  }

  function handleDiscard() {
    setPromptName(null)
    exitRowEdit(rowId, { force: true })
  }

  // Escape on the prompt: revert the draft to the committed payee name so the
  // next exit attempt is clean, and keep the row in edit mode.
  function handleDismiss() {
    payeeDraftRef.current?.reset()
    setPromptName(null)
  }

  return {
    payeeDraftRef,
    payeeAnchorRef,
    promptName,
    busy,
    error,
    handleCreate,
    handleDiscard,
    handleDismiss,
  }
}

'use client'

import { useEffect, useState } from 'react'
import type { CategoryGroup } from '@/components/rules/rule-editor'

interface PayeeWithDetails {
  id: string
  name: string
  defaultCategoryId: string | null
  defaultCategory: {
    id: string
    name: string
    group: { id: string; name: string }
  } | null
  _count: { transactions: number }
}

export function PayeeManager({
  initialPayees,
  initialGroups,
}: {
  initialPayees?: PayeeWithDetails[]
  initialGroups?: CategoryGroup[]
} = {}) {
  const [payees, setPayees] = useState<PayeeWithDetails[]>(initialPayees ?? [])
  const [groups, setGroups] = useState<CategoryGroup[]>(initialGroups ?? [])
  const [loading, setLoading] = useState(!initialPayees)
  const [error, setError] = useState<string | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (initialPayees) return
    Promise.all([
      fetch('/api/payees').then((r) => r.json()),
      fetch('/api/category-groups').then((r) => r.json()),
    ])
      .then(([pj, gj]) => {
        if (!pj.error) setPayees(pj.data ?? [])
        if (!gj.error) setGroups(gj.data ?? [])
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [initialPayees])

  async function renamePayee(id: string) {
    const name = renameValue.trim()
    if (!name) { setRenamingId(null); return }
    const res = await fetch(`/api/payees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const j = await res.json()
    if (res.ok && !j.error) {
      setPayees((prev) => prev.map((p) => p.id === id ? { ...p, name } : p))
    }
    setRenamingId(null)
  }

  async function setDefaultCategory(payeeId: string, categoryId: string | null) {
    const res = await fetch(`/api/payees/${payeeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultCategoryId: categoryId }),
    })
    const j = await res.json()
    if (res.ok && !j.error) {
      setPayees((prev) => prev.map((p) =>
        p.id === payeeId
          ? { ...p, defaultCategoryId: j.data.defaultCategoryId, defaultCategory: j.data.defaultCategory }
          : p
      ))
    }
  }

  async function deletePayee(id: string) {
    setDeletingId(id)
    const res = await fetch(`/api/payees/${id}`, { method: 'DELETE' })
    const j = await res.json()
    if (res.ok && !j.error) {
      setPayees((prev) => prev.filter((p) => p.id !== id))
    } else {
      setError(j.error ?? 'Failed to delete payee')
    }
    setDeletingId(null)
    setConfirmDeleteId(null)
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-2" data-testid="payee-manager">
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {payees.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
          No payees yet. They are created automatically during CSV import.
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs" aria-label="Payees">
            <thead className="bg-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-1 text-left font-medium">Payee name</th>
                <th className="px-3 py-1 text-left font-medium">Default category</th>
                <th className="px-3 py-1 text-center font-medium w-28">Transactions</th>
                <th className="px-3 py-1 w-16" />
              </tr>
            </thead>
            <tbody>
              {payees.map((payee) => (
                <tr key={payee.id} className="border-t hover:bg-muted/40" data-testid="payee-row">
                  <td className="px-3 py-0.5">
                    {renamingId === payee.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renamePayee(payee.id)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={() => renamePayee(payee.id)}
                        className="rounded border border-blue-400 px-2 py-0.5 text-xs outline-none w-full"
                        aria-label="Rename payee"
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:text-primary"
                        onClick={() => { setRenamingId(payee.id); setRenameValue(payee.name) }}
                        title="Click to rename"
                      >
                        {payee.name}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-0.5">
                    <select
                      value={payee.defaultCategoryId ?? ''}
                      onChange={(e) => setDefaultCategory(payee.id, e.target.value || null)}
                      className="rounded border px-2 py-0.5 text-xs w-full max-w-xs"
                      aria-label="Default category"
                    >
                      <option value="">— None —</option>
                      {groups.map((g) => (
                        <optgroup key={g.id} label={g.name}>
                          {g.categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>

                  <td className="px-3 py-1 text-center text-muted-foreground">
                    {payee._count.transactions}
                  </td>

                  <td className="px-3 py-0.5">
                    {confirmDeleteId === payee.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => deletePayee(payee.id)}
                          disabled={deletingId === payee.id}
                          className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700"
                          aria-label="Confirm delete"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded border px-2 py-0.5 text-xs"
                          aria-label="Cancel delete"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(payee.id)}
                        disabled={deletingId === payee.id}
                        className="rounded p-1 text-muted-foreground hover:text-red-600 disabled:opacity-40"
                        aria-label="Delete payee"
                      >
                        🗑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

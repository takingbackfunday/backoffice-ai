'use client'

import React from 'react'
import type { Payee } from '@/components/rules/rule-editor'
import type { CategoryGroup } from '@/components/rules/rule-editor'
import type { Workspace } from '@/generated/prisma/client'
import { TextCell } from '../cells/text-cell'
import { WorkspaceCell } from '../cells/workspace-cell'
import { CategoryCell } from '../cells/category-cell'
import { PayeeCell } from '../cells/payee-cell'

export function NewRow({
  newRow,
  setNewRow,
  savingNew,
  newRowError,
  accounts,
  payees,
  setPayees,
  categoryGroups,
  projects,
  todayISO,
  onSave,
  onCancel,
}: {
  newRow: { accountId: string; date: string; amount: string; description: string; categoryId: string; payeeId: string; projectId: string; notes: string }
  setNewRow: React.Dispatch<React.SetStateAction<{ accountId: string; date: string; amount: string; description: string; categoryId: string; payeeId: string; projectId: string; notes: string }>>
  savingNew: boolean
  newRowError: string | null
  accounts: { id: string; name: string }[]
  payees: Payee[]
  setPayees: React.Dispatch<React.SetStateAction<Payee[]>>
  categoryGroups: CategoryGroup[]
  projects: Workspace[]
  todayISO: string
  onSave: () => void
  onCancel: () => void
}) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') onSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <tr className="border-t bg-blue-50/60" data-testid="new-transaction-row">
      <td className="px-3 py-1 w-8" />
      {/* Date */}
      <td className="px-3 py-1 min-w-[130px]">
        <input
          type="date"
          value={newRow.date}
          onChange={(e) => setNewRow((r) => ({ ...r, date: e.target.value }))}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        />
      </td>
      {/* Account */}
      <td className="px-3 py-1 min-w-[120px]">
        <select
          value={newRow.accountId}
          onChange={(e) => setNewRow((r) => ({ ...r, accountId: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
          className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">— Select —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </td>
      {/* Description */}
      <td className="px-3 py-1 min-w-[160px]">
        <input
          autoFocus
          type="text"
          placeholder="Description"
          value={newRow.description}
          onChange={(e) => setNewRow((r) => ({ ...r, description: e.target.value }))}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        />
      </td>
      {/* Amount */}
      <td className="px-3 py-1 min-w-[90px]">
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={newRow.amount}
          onChange={(e) => setNewRow((r) => ({ ...r, amount: e.target.value }))}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400 text-right font-mono"
        />
      </td>
      {/* Currency — derived from account, not editable */}
      <td className="px-3 py-1 text-xs text-muted-foreground">—</td>

      {/* Payee */}
      <td className="px-3 py-1 min-w-[140px]">
        <PayeeCell
          value={newRow.payeeId || null}
          payees={payees}
          onCommit={(v) => setNewRow((r) => ({ ...r, payeeId: v ?? '' }))}
          onCancel={() => {}}
          onNewPayee={(p) => {
            setPayees((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))
            setNewRow((r) => ({ ...r, payeeId: p.id }))
          }}
        />
      </td>
      {/* Category */}
      <td className="px-3 py-1 min-w-[160px]">
        <CategoryCell
          value={newRow.categoryId || null}
          groups={categoryGroups}
          description={newRow.description}
          payeeName={payees.find((p) => p.id === newRow.payeeId)?.name ?? null}
          amount={parseFloat(newRow.amount) || 0}
          onCommit={(v) => setNewRow((r) => ({ ...r, categoryId: v ?? '' }))}
          onCancel={() => {}}
        />
      </td>
      {/* Group — auto-derived */}
      <td className="px-3 py-1 text-xs text-muted-foreground whitespace-nowrap">
        {newRow.categoryId
          ? (categoryGroups.find((g) => g.categories.some((c) => c.id === newRow.categoryId))?.name ?? '—')
          : '—'}
      </td>
      {/* Notes */}
      <td className="px-3 py-1 min-w-[120px]">
        <input
          type="text"
          placeholder="Notes"
          value={newRow.notes}
          onChange={(e) => setNewRow((r) => ({ ...r, notes: e.target.value }))}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        />
      </td>
      {/* Workspace */}
      <td className="px-3 py-1 min-w-[120px]">
        <WorkspaceCell
          value={newRow.projectId || null}
          projects={projects}
          onCommit={(v) => setNewRow((r) => ({ ...r, projectId: v ?? '' }))}
          onCancel={() => {}}
        />
      </td>
      {/* Save / Cancel */}
      <td className="px-3 py-1 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSave}
            disabled={savingNew}
            className="rounded bg-[#534AB7] px-2 py-0.5 text-[10px] text-white hover:bg-[#4338CA] disabled:opacity-50 transition-colors"
            data-testid="new-row-save-btn"
          >
            {savingNew ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground text-xs leading-none px-0.5"
            aria-label="Cancel new row"
            data-testid="new-row-cancel-btn"
          >
            ×
          </button>
        </div>
        {newRowError && (
          <p className="text-[10px] text-red-600 mt-0.5 max-w-[200px]">{newRowError}</p>
        )}
      </td>
    </tr>
  )
}

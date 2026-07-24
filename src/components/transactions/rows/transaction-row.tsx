'use client'

import React from 'react'
import type { TransactionWithRelations } from '@/types'
import type { Payee } from '@/components/rules/rule-editor'
import type { CategoryGroup } from '@/components/rules/rule-editor'
import type { Workspace } from '@/generated/prisma/client'
import { toDisplay } from '@/lib/money'
import { TextCell } from '../cells/text-cell'
import { WorkspaceCell } from '../cells/workspace-cell'
import { CategoryCell } from '../cells/category-cell'
import { PayeeCell, type PayeeDraftHandle } from '../cells/payee-cell'
import { PayeeCreatePrompt } from '../cells/payee-create-prompt'
import { DescriptionCell } from '../cells/description-cell'
import type { EditableField } from '../hooks/use-inline-edit'
import type { MakeRuleSnapType } from '../hooks/make-rule-snap'
import { usePayeeCreatePrompt, upsertPayee } from '../hooks/use-payee-create-prompt'
import { RuleEditor } from '@/components/rules/rule-editor'

export function renderEditableCell(
  row: TransactionWithRelations,
  field: EditableField,
  opts: {
    editingRowId: string | null
    editingRowInitialField: EditableField | null
    savingIds: Set<string>
    errorIds: Set<string>
    projects: Workspace[]
    categoryGroups: CategoryGroup[]
    payees: Payee[]
    startEdit: (id: string, field: EditableField) => void
    exitRowEdit: (id: string, opts?: { force?: boolean }) => void
    commitEdit: (id: string, field: EditableField, rawValue: string | null, freshPayee?: Payee) => void
    setPayees: React.Dispatch<React.SetStateAction<Payee[]>>
    payeeDraftRef: React.RefObject<PayeeDraftHandle | null>
    payeeAnchorRef: React.RefObject<HTMLTableCellElement | null>
  }
) {
  const { editingRowId, editingRowInitialField, savingIds, errorIds, projects, categoryGroups, payees, startEdit, exitRowEdit, commitEdit, setPayees, payeeDraftRef, payeeAnchorRef } = opts
  const isEditing = editingRowId === row.id
  const isInitialField = editingRowInitialField === field
  const isSaving = savingIds.has(row.id)
  const hasError = errorIds.has(row.id)

  let displayValue: string
  if (field === 'projectId') {
    displayValue = row.workspace?.name ?? '—'
  } else if (field === 'categoryId') {
    displayValue = row.categoryRef?.name ?? row.category ?? '—'
  } else if (field === 'payeeId') {
    displayValue = row.payee?.name ?? '—'
  } else if (field === 'amount') {
    const n = toDisplay(row.amount)
    displayValue = (n >= 0 ? '+' : '') + n.toFixed(2)
  } else if (field === 'date') {
    displayValue = new Date(row.date).toLocaleDateString()
  } else {
    displayValue = (row[field as keyof TransactionWithRelations] as string | null) ?? '—'
  }

  const cellClass = [
    'px-3 py-0.5 cursor-pointer',
    isSaving ? 'opacity-50' : '',
    hasError ? 'ring-1 ring-inset ring-red-400 rounded' : '',
    field === 'amount' ? 'text-right font-mono' : '',
    field === 'amount' && toDisplay(row.amount) >= 0 ? 'text-green-600' : '',
    field === 'amount' && toDisplay(row.amount) < 0 ? 'text-red-600' : '',
  ].filter(Boolean).join(' ')

  if (isEditing) {
    if (field === 'projectId') {
      return (
        <td key={field} className="px-3 py-0.5 min-w-[120px]">
          <WorkspaceCell
            value={row.workspaceId ?? null}
            projects={projects}
            autoFocus={isInitialField}
            onCommit={(v) => commitEdit(row.id, 'projectId', v)}
            onCancel={() => exitRowEdit(row.id)}
          />
        </td>
      )
    }

    if (field === 'categoryId') {
      return (
        <td key={field} className="px-3 py-0.5 min-w-[160px]">
          <CategoryCell
            value={row.categoryId ?? null}
            groups={categoryGroups}
            description={row.description}
            payeeName={row.payee?.name ?? null}
            amount={toDisplay(row.amount)}
            autoFocus={isInitialField}
            onCommit={(v) => commitEdit(row.id, 'categoryId', v)}
            onCancel={() => exitRowEdit(row.id)}
          />
        </td>
      )
    }

    if (field === 'payeeId') {
      return (
        <td key={field} ref={payeeAnchorRef} className="px-3 py-0.5 min-w-[140px]">
          <PayeeCell
            value={row.payeeId ?? null}
            payees={payees}
            autoFocus={isInitialField}
            unmatchedDraftRef={payeeDraftRef}
            onCommit={(v, freshPayee) => commitEdit(row.id, 'payeeId', v, freshPayee)}
            onCancel={() => exitRowEdit(row.id)}
            onNewPayee={(p) => setPayees((prev) => upsertPayee(prev, p))}
          />
        </td>
      )
    }

    if (field === 'date') {
      const isoDate = new Date(row.date).toISOString().slice(0, 10)
      return (
        <td key={field} className="px-3 py-0.5 min-w-[130px]">
          <TextCell
            value={isoDate}
            type="date"
            autoFocus={isInitialField}
            onCommit={(v) => commitEdit(row.id, 'date', v)}
            onCancel={() => exitRowEdit(row.id)}
          />
        </td>
      )
    }

    const rawVal =
      field === 'amount'
        ? String(toDisplay(row.amount))
        : (row[field as keyof TransactionWithRelations] as string | null) ?? ''

    return (
      <td key={field} className="px-3 py-0.5 min-w-[100px]">
        <TextCell
          value={rawVal as string}
          type={field === 'amount' ? 'number' : 'text'}
          autoFocus={isInitialField}
          onCommit={(v) => commitEdit(row.id, field, v)}
          onCancel={() => exitRowEdit(row.id)}
        />
      </td>
    )
  }

  if (field === 'description') {
    return (
      <DescriptionCell
        key={field}
        value={displayValue}
        className={cellClass}
        onStartEdit={() => { if (!isEditing) startEdit(row.id, field) }}
      />
    )
  }

  return (
    <td
      key={field}
      className={cellClass}
      onClick={() => { if (!isEditing) startEdit(row.id, field) }}
      title={field === 'notes' ? undefined : 'Click to edit'}
      data-testid={`cell-${field}`}
    >
      {field === 'categoryId' ? (
        <span className={displayValue !== '—' ? 'text-[10px] rounded-full bg-blue-100 text-blue-700 px-1.5 py-px max-w-[120px] truncate block' : ''}>
          {displayValue}
        </span>
      ) : field === 'notes' ? (
        <span className="flex items-center gap-1 max-w-[200px]">
          {(row.receipts?.length ?? 0) > 0 && (
            <a
              href="/receipts"
              onClick={(e) => e.stopPropagation()}
              title={`${row.receipts.length} receipt${row.receipts.length > 1 ? 's' : ''} attached`}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              {(row.receipts?.length ?? 0) > 1 && (
                <span className="text-[10px] ml-0.5">{row.receipts.length}</span>
              )}
            </a>
          )}
          <span className="truncate block" title={displayValue}>{displayValue}</span>
        </span>
      ) : (
        <span>{displayValue}</span>
      )}
    </td>
  )
}

export function TransactionRow({
  row,
  editingRowId,
  editingRowInitialField,
  savingIds,
  errorIds,
  deletingIds,
  selectedIds,
  selectMode,
  makeRuleSnap,
  showMakeRuleEditor,
  lastEditedRowId,
  projects,
  categoryGroups,
  payees,
  accounts,
  startEdit,
  exitRowEdit,
  commitEdit,
  setPayees,
  toggleRow,
  setMakeRuleSnap,
  setShowMakeRuleEditor,
  setLastEditedRowId,
  handleApplyComplete,
  payeeExitGuardRef,
}: {
  row: TransactionWithRelations
  editingRowId: string | null
  editingRowInitialField: EditableField | null
  savingIds: Set<string>
  errorIds: Set<string>
  deletingIds: Set<string>
  selectedIds: Set<string>
  selectMode: boolean
  makeRuleSnap: MakeRuleSnapType | null
  showMakeRuleEditor: boolean
  lastEditedRowId: string | null
  projects: Workspace[]
  categoryGroups: CategoryGroup[]
  payees: Payee[]
  accounts: { id: string; name: string }[]
  startEdit: (id: string, field: EditableField) => void
  exitRowEdit: (id: string, opts?: { force?: boolean }) => void
  commitEdit: (id: string, field: EditableField, rawValue: string | null, freshPayee?: Payee) => void
  setPayees: React.Dispatch<React.SetStateAction<Payee[]>>
  toggleRow: (id: string) => void
  setMakeRuleSnap: React.Dispatch<React.SetStateAction<MakeRuleSnapType | null>>
  setShowMakeRuleEditor: React.Dispatch<React.SetStateAction<boolean>>
  setLastEditedRowId: React.Dispatch<React.SetStateAction<string | null>>
  handleApplyComplete: () => void
  payeeExitGuardRef: React.RefObject<((rowId: string) => boolean) | null>
}) {
  const isDeleting = deletingIds.has(row.id)
  const isSelected = selectedIds.has(row.id)
  const isRowEditing = editingRowId === row.id
  const payeePrompt = usePayeeCreatePrompt({
    rowId: row.id,
    isRowEditing,
    payeeExitGuardRef,
    setPayees,
    commitEdit,
    exitRowEdit,
  })
  const cellOpts = { editingRowId, editingRowInitialField, savingIds, errorIds, projects, categoryGroups, payees, startEdit, exitRowEdit, commitEdit, setPayees, payeeDraftRef: payeePrompt.payeeDraftRef, payeeAnchorRef: payeePrompt.payeeAnchorRef }

  return (
    <>
      <tr
        data-row-id={row.id}
        className={[
          'border-t transition-colors',
          isDeleting ? 'opacity-50 bg-red-50'
            : isRowEditing ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-200'
            : isSelected ? 'bg-blue-50'
            : selectMode ? 'hover:bg-blue-50/50 cursor-pointer'
            : 'hover:bg-muted/40',
        ].filter(Boolean).join(' ')}
        data-testid="transaction-row"
        onClick={selectMode ? () => toggleRow(row.id) : undefined}
        onKeyDown={isRowEditing ? (e) => { if (e.key === 'Enter') exitRowEdit(row.id) } : undefined}
      >
        {/* Checkbox — only shown in select mode */}
        <td className="px-3 py-0.5 w-8" onClick={(e) => e.stopPropagation()}>
          {selectMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleRow(row.id)}
              aria-label={`Select row ${row.id}`}
              className="cursor-pointer"
            />
          )}
        </td>

        {renderEditableCell(row, 'date', cellOpts)}
        <td className="px-3 py-0.5 text-muted-foreground whitespace-nowrap">{row.account.name}</td>
        {renderEditableCell(row, 'description', cellOpts)}
        {renderEditableCell(row, 'amount', cellOpts)}
        <td className="px-3 py-0.5 text-xs text-muted-foreground whitespace-nowrap">{row.account.currency ?? '—'}</td>
        {renderEditableCell(row, 'payeeId', cellOpts)}
        {renderEditableCell(row, 'categoryId', cellOpts)}
        <td className="px-3 py-0.5 text-xs text-muted-foreground whitespace-nowrap">
          {row.categoryRef?.group?.name ?? '—'}
        </td>
        {renderEditableCell(row, 'notes', cellOpts)}
        {renderEditableCell(row, 'projectId', cellOpts)}
        {isRowEditing ? (
          <td className="px-2 py-0.5 whitespace-nowrap">
            <button
              onMouseDown={(e) => { e.preventDefault(); exitRowEdit(row.id) }}
              className="text-xs px-2 py-0.5 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
            >
              Done
            </button>
          </td>
        ) : makeRuleSnap && lastEditedRowId === row.id && !showMakeRuleEditor ? (
          <td className="px-2 py-0.5 whitespace-nowrap">
            <div className="flex items-center gap-1">
              <span className="text-[11px]">💡</span>
              <button
                onClick={() => setShowMakeRuleEditor(true)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#534AB7] text-white font-medium hover:bg-[#4338CA] transition-colors whitespace-nowrap"
              >
                Make rule
              </button>
              <button
                onClick={() => { setMakeRuleSnap(null) }}
                className="text-muted-foreground hover:text-foreground leading-none text-[11px] px-0.5"
                aria-label="Dismiss"
              >✕</button>
            </div>
          </td>
        ) : (
          <td />
        )}
      </tr>
      {/* Payee create prompt — portaled, anchored to the payee cell */}
      {payeePrompt.promptName && (
        <PayeeCreatePrompt
          anchorRef={payeePrompt.payeeAnchorRef}
          name={payeePrompt.promptName}
          busy={payeePrompt.busy}
          error={payeePrompt.error}
          onCreate={payeePrompt.handleCreate}
          onDiscard={payeePrompt.handleDiscard}
          onDismiss={payeePrompt.handleDismiss}
        />
      )}
      {/* Rule editor sub-row — appears below the edited row */}
      {makeRuleSnap && lastEditedRowId === row.id && showMakeRuleEditor && (
        <tr className="border-t border-[#534AB7]/15 bg-[#EEEDFE]/20">
          <td colSpan={13} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px]">💡</span>
              <span className="text-xs font-medium text-[#3C3489]">New rule from this change</span>
              <button
                onClick={() => { setMakeRuleSnap(null); setShowMakeRuleEditor(false) }}
                className="ml-auto text-muted-foreground hover:text-foreground leading-none text-sm"
                aria-label="Dismiss"
              >✕</button>
            </div>
            <RuleEditor
              projects={projects}
              payees={payees}
              accounts={accounts}
              categoryGroups={categoryGroups}
              editingRule={{
                id: '',
                name: '',
                priority: 50,
                categoryName: makeRuleSnap.categoryName ?? '',
                categoryId: makeRuleSnap.categoryId ?? null,
                categoryRef: null,
                payeeId: makeRuleSnap.payeeId ?? null,
                payee: makeRuleSnap.payeeName ? { id: makeRuleSnap.payeeId ?? '', name: makeRuleSnap.payeeName } : null,
                projectId: null,
                workspace: null,
                conditions: { all: [{ field: 'description', operator: 'contains', value: makeRuleSnap.description }] },
                isActive: true,
              }}
              onSave={() => { setMakeRuleSnap(null); setShowMakeRuleEditor(false) }}
              onCancel={() => { setMakeRuleSnap(null); setShowMakeRuleEditor(false) }}
              showSaveAndApply={true}
              onApplyComplete={handleApplyComplete}
            />
          </td>
        </tr>
      )}
    </>
  )
}

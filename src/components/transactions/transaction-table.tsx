'use client'

import React, { useEffect, useState, useCallback } from 'react'
import type { Workspace } from '@/generated/prisma/client'
import type { TransactionWithRelations } from '@/types'
import type { CategoryGroup, Payee } from '@/components/rules/rule-editor'
import { TransactionModals } from './toolbar/transaction-modals'
import { useTransactionData } from './hooks/use-transaction-data'
import { useInlineEdit } from './hooks/use-inline-edit'
import { useBulkSelect } from './hooks/use-bulk-select'
import { useNlSearch } from './hooks/use-nl-search'
import { TransactionTableHead } from './headers/transaction-table-head'
import { TransactionRow } from './rows/transaction-row'
import { NewRow } from './rows/new-row'
import { BulkDeleteBar } from './toolbar/bulk-delete-bar'
import { NlSearchBar } from './toolbar/nl-search-bar'
import { DateFilterHeader } from './headers/date-filter-header'
import { FilterableSortHeader } from './headers/filterable-sort-header'

interface Props {
  initialRows?: TransactionWithRelations[]
  initialTotal?: number
  initialWorkspaces?: Workspace[]
  initialCategoryGroups?: CategoryGroup[]
  initialPayees?: Payee[]
  initialAccounts?: { id: string; name: string }[]
}

export function TransactionTable({ initialRows, initialTotal, initialWorkspaces, initialCategoryGroups, initialPayees, initialAccounts }: Props) {
  const data = useTransactionData({ initialRows, initialTotal })

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>(initialAccounts ?? [])
  const [projects, setWorkspaces] = useState<Workspace[]>(initialWorkspaces ?? [])
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>(initialCategoryGroups ?? [])
  const [payees, setPayees] = useState<Payee[]>(initialPayees ?? [])

  // New row state
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState({ accountId: '', date: data.todayISO, amount: '', description: '', categoryId: '', payeeId: '', projectId: '', notes: '' })
  const [savingNew, setSavingNew] = useState(false)
  const [newRowError, setNewRowError] = useState<string | null>(null)

  // Bulk select
  const bulk = useBulkSelect({
    localRows: data.localRows,
    setLocalRows: data.setLocalRows as React.Dispatch<React.SetStateAction<{ id: string }[]>>,
    setTotal: data.setTotal,
  })

  // Inline edit
  const edit = useInlineEdit({
    localRows: data.localRows,
    setLocalRows: data.setLocalRows,
    setError: data.setError,
    projects,
    categoryGroups,
    payees,
    setPayees,
    selectMode: bulk.selectMode,
    deletingIds: bulk.deletingIds,
    setDeletingIds: bulk.setDeletingIds,
  })

  // NL search
  const ai = useNlSearch({
    setFilters: data.setFilters,
    setDebouncedFilters: data.setDebouncedFilters,
    setSearch: data.setSearch,
    setDebouncedSearch: data.setDebouncedSearch,
    setDateFrom: data.setDateFrom,
    setDateTo: data.setDateTo,
    setSortBy: data.setSortBy,
    setSortDir: data.setSortDir,
    setPage: data.setPage,
    setError: data.setError,
    clearAllFilters: () => {
      data.clearAllFilters()
      bulk.setSelectMode(false)
      bulk.setSelectedIds(new Set())
    },
  })

  // Toolbar modals
  const [showNewRuleModal, setShowNewRuleModal] = useState(false)
  const [showAgentModal, setShowAgentModal] = useState(false)

  // Account options for filter
  const accountOptions = Array.from(
    new Map(data.localRows.map((r) => [r.account.name, r.account.name])).entries()
  ).map(([name]) => ({ value: name, label: name }))

  // Load lookups (skip if passed from server)
  useEffect(() => {
    if (initialWorkspaces && initialCategoryGroups && initialPayees) return
    if (!initialWorkspaces) fetch('/api/projects').then((r) => r.json()).then((j) => { if (!j.error) setWorkspaces(j.data ?? []) }).catch(() => {})
    if (!initialCategoryGroups) fetch('/api/category-groups').then((r) => r.json()).then((j) => { if (!j.error) setCategoryGroups(j.data ?? []) }).catch(() => {})
    if (!initialPayees) fetch('/api/payees').then((r) => r.json()).then((j) => { if (!j.error) setPayees(j.data ?? []) }).catch(() => {})
  }, [initialWorkspaces, initialCategoryGroups, initialPayees])

  useEffect(() => {
    if (initialAccounts) return
    fetch('/api/accounts').then((r) => r.json()).then((j) => { if (!j.error) setAccounts(j.data ?? []) }).catch(() => {})
  }, [initialAccounts])

  function handleApplyComplete() {
    data.refetch()
  }

  // New row handlers
  function resetNewRow() {
    setNewRow({ accountId: '', date: data.todayISO, amount: '', description: '', categoryId: '', payeeId: '', projectId: '', notes: '' })
    setNewRowError(null)
  }

  async function handleSaveNewRow() {
    if (!newRow.accountId || !newRow.date || newRow.amount === '' || !newRow.description) {
      setNewRowError('Account, date, amount and description are required.')
      return
    }
    setSavingNew(true)
    setNewRowError(null)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: newRow.accountId,
          date: newRow.date,
          amount: parseFloat(newRow.amount),
          description: newRow.description,
          ...(newRow.categoryId ? { categoryId: newRow.categoryId } : {}),
          ...(newRow.payeeId ? { payeeId: newRow.payeeId } : {}),
          ...(newRow.projectId ? { projectId: newRow.projectId } : {}),
          ...(newRow.notes ? { notes: newRow.notes } : {}),
        }),
      })
      const json = await res.json()
      if (json.error) { setNewRowError(json.error); setSavingNew(false); return }
      data.setLocalRows((prev) => [json.data, ...prev])
      data.setTotal((t) => t + 1)
      setAddingRow(false)
      resetNewRow()
    } catch {
      setNewRowError('Failed to save transaction.')
    } finally {
      setSavingNew(false)
    }
  }

  function handleCancelNewRow() {
    setAddingRow(false)
    resetNewRow()
  }

  return (
    <div className="space-y-3" data-testid="transaction-table">
      {/* Toolbar */}
      <style>{`
        @keyframes bulkDeletePulse {
          0%, 100% { background-color: #dc2626; }
          50% { background-color: #991b1b; }
        }
      `}</style>
      <div className="flex items-center gap-3 flex-wrap">
        <NlSearchBar
          aiMode={ai.aiMode}
          setAiMode={ai.setAiMode}
          aiQuery={ai.aiQuery}
          setAiQuery={ai.setAiQuery}
          aiLoading={ai.aiLoading}
          search={data.search}
          setSearch={data.setSearch}
          onHandleAiSearch={ai.handleAiSearch}
          onClearAiSearch={ai.clearAiSearch}
          loading={data.loading}
        />

        <div className="flex-1" />

        <BulkDeleteBar
          selectMode={bulk.selectMode}
          selectedIds={bulk.selectedIds}
          bulkDeleting={bulk.bulkDeleting}
          bulkDeletedCount={bulk.bulkDeletedCount}
          deletingIds={edit.deletingIds}
          onConfirmBulkDelete={bulk.confirmBulkDelete}
          onExitSelectMode={bulk.exitSelectMode}
          onSetSelectMode={bulk.setSelectMode}
          onSetAddingRow={setAddingRow}
          addingRow={addingRow}
        />

        {/* Rules group */}
        <div className="flex items-center gap-px rounded-lg border border-[#534AB7]/20 bg-[#EEEDFE]/40 p-0.5">
          <button
            type="button"
            onClick={() => setShowNewRuleModal(true)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#3C3489] hover:bg-[#EEEDFE] hover:shadow-sm transition-all"
          >
            + Create rule
          </button>
          <button
            type="button"
            onClick={() => setShowAgentModal(true)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#3C3489] hover:bg-[#EEEDFE] hover:shadow-sm transition-all"
          >
            Run rules agent
          </button>
        </div>

        {/* Active filters */}
        {data.hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#3C3489] bg-[#EEEDFE] border border-[#534AB7]/20 rounded-full px-2.5 py-1">
              {data.activeFilterCount} filter{data.activeFilterCount !== 1 ? 's' : ''} active
            </span>
            <button
              onClick={() => { data.clearAllFilters(); bulk.setSelectMode(false); bulk.setSelectedIds(new Set()) }}
              className="text-xs text-muted-foreground hover:text-foreground border border-black/10 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {data.loading && data.total === 0 ? 'Loading…' : `${data.total} transaction${data.total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {data.error && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          <span>{data.error}</span>
          <button
            type="button"
            onClick={data.refetch}
            className="ml-auto text-xs font-medium text-destructive hover:underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {ai.aiExplanation && (
        <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50/50 px-3 py-2 text-xs text-purple-800">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" strokeLinecap="round"/>
          </svg>
          <span>{ai.aiExplanation}</span>
          <button onClick={ai.clearAiSearch} className="ml-auto text-purple-500 hover:text-purple-700">✕</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-[11px]" aria-label="Transactions">
          <TransactionTableHead
            sortBy={data.sortBy} sortDir={data.sortDir} onSort={data.handleSort}
            filters={data.filters} setFilters={data.setFilters}
            openFilterCol={data.openFilterCol} setOpenFilterCol={data.setOpenFilterCol}
            dateFrom={data.dateFrom} dateTo={data.dateTo}
            customFrom={data.customFrom} customTo={data.customTo}
            setCustomFrom={data.setCustomFrom} setCustomTo={data.setCustomTo}
            applyPreset={data.applyPreset} applyCustomDates={data.applyCustomDates}
            clearDateFilter={data.clearDateFilter}
            accountOptions={accountOptions} categoryGroups={categoryGroups} projects={projects}
            selectMode={bulk.selectMode} allChecked={bulk.allChecked}
            someChecked={bulk.someChecked} toggleAll={bulk.toggleAll}
          />
          <tbody>
            {addingRow && (
              <NewRow
                newRow={newRow}
                setNewRow={setNewRow}
                savingNew={savingNew}
                newRowError={newRowError}
                accounts={accounts}
                payees={payees}
                setPayees={setPayees}
                categoryGroups={categoryGroups}
                projects={projects}
                todayISO={data.todayISO}
                onSave={handleSaveNewRow}
                onCancel={handleCancelNewRow}
              />
            )}

            {data.loading && data.localRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground" aria-live="polite">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Loading from database…
                  </span>
                </td>
              </tr>
            ) : !data.loading && data.localRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">No transactions found.</td>
              </tr>
            ) : (
              data.localRows.map((row) => (
                <TransactionRow
                  key={row.id}
                  row={row}
                  editingRowId={edit.editingRowId}
                  editingRowInitialField={edit.editingRowInitialField}
                  savingIds={edit.savingIds}
                  errorIds={edit.errorIds}
                  deletingIds={edit.deletingIds}
                  selectedIds={bulk.selectedIds}
                  selectMode={bulk.selectMode}
                  makeRuleSnap={edit.makeRuleSnap}
                  showMakeRuleEditor={edit.showMakeRuleEditor}
                  lastEditedRowId={edit.lastEditedRowId}
                  projects={projects}
                  categoryGroups={categoryGroups}
                  payees={payees}
                  accounts={accounts}
                  startEdit={edit.startEdit}
                  exitRowEdit={edit.exitRowEdit}
                  commitEdit={edit.commitEdit}
                  setPayees={setPayees}
                  toggleRow={bulk.toggleRow}
                  setMakeRuleSnap={edit.setMakeRuleSnap}
                  setShowMakeRuleEditor={edit.setShowMakeRuleEditor}
                  setLastEditedRowId={edit.setLastEditedRowId}
                  handleApplyComplete={handleApplyComplete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.total > 200 && (
        <div className="flex items-center gap-3 justify-end text-sm" aria-label="Pagination">
          <button
            onClick={() => data.setPage((p) => Math.max(1, p - 1))}
            disabled={data.page === 1}
            className="rounded border px-3 py-1 disabled:opacity-40"
            aria-label="Previous page"
            data-testid="prev-page-btn"
          >
            ← Prev
          </button>
          <span>Page {data.page} of {Math.ceil(data.total / 200)}</span>
          <button
            onClick={() => data.setPage((p) => p + 1)}
            disabled={data.page >= Math.ceil(data.total / 200)}
            className="rounded border px-3 py-1 disabled:opacity-40"
            aria-label="Next page"
            data-testid="next-page-btn"
          >
            Next →
          </button>
        </div>
      )}

      {/* Modals */}
      <TransactionModals
        showNewRuleModal={showNewRuleModal}
        setShowNewRuleModal={setShowNewRuleModal}
        showAgentModal={showAgentModal}
        setShowAgentModal={setShowAgentModal}
        projects={projects}
        payees={payees}
        accounts={accounts}
        categoryGroups={categoryGroups}
        onApplyComplete={handleApplyComplete}
      />
    </div>
  )
}

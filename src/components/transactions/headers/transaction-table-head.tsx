'use client'

import type { CategoryGroup } from '@/components/rules/rule-editor'
import type { ColumnFilters } from '../hooks/use-transaction-data'
import { DateFilterHeader } from './date-filter-header'
import { FilterableSortHeader } from './filterable-sort-header'

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDir = 'asc' | 'desc'

export function TransactionTableHead({
  sortBy,
  sortDir,
  onSort,
  filters,
  setFilters,
  openFilterCol,
  setOpenFilterCol,
  dateFrom,
  dateTo,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
  applyPreset,
  applyCustomDates,
  clearDateFilter,
  accountOptions,
  categoryGroups,
  projects,
  selectMode,
  allChecked,
  someChecked,
  toggleAll,
}: {
  sortBy: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  filters: ColumnFilters
  setFilters: React.Dispatch<React.SetStateAction<ColumnFilters>>
  openFilterCol: string | null
  setOpenFilterCol: (col: string | null) => void
  dateFrom: string
  dateTo: string
  customFrom: string
  customTo: string
  setCustomFrom: (v: string) => void
  setCustomTo: (v: string) => void
  applyPreset: (p: 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'ytd') => void
  applyCustomDates: () => void
  clearDateFilter: () => void
  accountOptions: { value: string; label: string }[]
  categoryGroups: CategoryGroup[]
  projects: { id: string; name: string }[]
  selectMode: boolean
  allChecked: boolean
  someChecked: boolean
  toggleAll: () => void
}) {
  return (
    <thead className="bg-muted text-[10px] uppercase tracking-wide">
      <tr>
        <th className="px-3 py-1 w-8">
          {selectMode && (
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
              onChange={toggleAll}
              aria-label="Select all rows"
              data-testid="select-all-checkbox"
              className="cursor-pointer"
            />
          )}
        </th>

        <DateFilterHeader
          sortBy={sortBy} sortDir={sortDir} onSort={onSort}
          dateFrom={dateFrom} dateTo={dateTo} customFrom={customFrom} customTo={customTo}
          onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo}
          onApplyPreset={applyPreset} onApplyCustom={applyCustomDates} onClear={clearDateFilter}
          openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol}
        />

        <FilterableSortHeader label="Account" field="account" sortBy={sortBy} sortDir={sortDir} onSort={onSort} filterCol="accountName" openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol} filterValue={filters.accountName ?? ''} onFilterChange={(v) => setFilters((f) => ({ ...f, accountName: v }))} filterType="select" filterOptions={accountOptions} sortable={false} />
        <FilterableSortHeader label="Description" field="description" sortBy={sortBy} sortDir={sortDir} onSort={onSort} filterCol="description" openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol} filterValue={filters.description ?? ''} onFilterChange={(v) => setFilters((f) => ({ ...f, description: v }))} filterType="text" />
        <FilterableSortHeader label="Amount" field="amount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} filterCol="amount" openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol} filterValue={filters.amountMin ?? ''} filterValue2={filters.amountMax ?? ''} onFilterChange={(v) => setFilters((f) => ({ ...f, amountMin: v }))} onFilterChange2={(v) => setFilters((f) => ({ ...f, amountMax: v }))} filterType="amount-range" className="text-right" />
        <th className="px-3 py-1 text-left font-medium whitespace-nowrap">Currency</th>
        <FilterableSortHeader label="Payee" field="payee" sortBy={sortBy} sortDir={sortDir} onSort={onSort} filterCol="payeeName" openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol} filterValue={filters.payeeName ?? ''} onFilterChange={(v) => setFilters((f) => ({ ...f, payeeName: v }))} filterType="text" sortable={false} className="min-w-[140px]" />
        <FilterableSortHeader label="Category" field="category" sortBy={sortBy} sortDir={sortDir} onSort={onSort} filterCol="categoryId" openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol} filterValue={filters.categoryId ?? ''} onFilterChange={(v) => setFilters((f) => ({ ...f, categoryId: v }))} filterType="optgroup-select" filterGroups={categoryGroups} />
        <FilterableSortHeader label="Group" field="category" sortBy={sortBy} sortDir={sortDir} onSort={onSort} filterCol="categoryGroupId" openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol} filterValue={filters.categoryGroupId ?? ''} onFilterChange={(v) => setFilters((f) => ({ ...f, categoryGroupId: v }))} filterType="select" filterOptions={categoryGroups.map((g) => ({ value: g.id, label: g.name }))} sortable={false} />
        <FilterableSortHeader label="Notes" field="notes" sortBy={sortBy} sortDir={sortDir} onSort={onSort} filterCol="notes" openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol} filterValue={filters.notes ?? ''} onFilterChange={(v) => setFilters((f) => ({ ...f, notes: v }))} filterType="text" sortable={false} />
        <FilterableSortHeader label="Workspace" field="project" sortBy={sortBy} sortDir={sortDir} onSort={onSort} filterCol="projectId" openFilterCol={openFilterCol} setOpenFilterCol={setOpenFilterCol} filterValue={filters.projectId ?? ''} onFilterChange={(v) => setFilters((f) => ({ ...f, projectId: v }))} filterType="select" filterOptions={projects.map((p) => ({ value: p.id, label: p.name }))} sortable={false} />
        <th className="w-16" />
      </tr>
    </thead>
  )
}

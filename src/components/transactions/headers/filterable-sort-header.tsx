'use client'

import type { CategoryGroup } from '@/components/rules/rule-editor'
import { ColumnFilterPopover } from './column-filter-popover'

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDir = 'asc' | 'desc'

export function FilterableSortHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  filterCol,
  openFilterCol,
  setOpenFilterCol,
  filterValue,
  filterValue2,
  onFilterChange,
  onFilterChange2,
  filterType,
  filterOptions,
  filterGroups,
  sortable = true,
  className = '',
}: {
  label: string
  field: string
  sortBy: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  filterCol: string
  openFilterCol: string | null
  setOpenFilterCol: (col: string | null) => void
  filterValue: string
  filterValue2?: string
  onFilterChange: (v: string) => void
  onFilterChange2?: (v: string) => void
  filterType: 'text' | 'select' | 'optgroup-select' | 'amount-range' | 'date'
  filterOptions?: { value: string; label: string }[]
  filterGroups?: CategoryGroup[]
  sortable?: boolean
  className?: string
}) {
  const isSortActive = sortBy === (field as SortField)
  return (
    <th
      className={`px-3 py-1 text-left font-medium whitespace-nowrap relative ${className}`}
    >
      <div className="flex items-center gap-1">
        {sortable ? (
          <span
            className="cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort(field as SortField)}
            aria-sort={isSortActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            {label}{isSortActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
          </span>
        ) : (
          <span className="select-none">{label}</span>
        )}
        <ColumnFilterPopover
          column={filterCol}
          isOpen={openFilterCol === filterCol}
          onOpen={() => setOpenFilterCol(filterCol)}
          onClose={() => setOpenFilterCol(null)}
          filterValue={filterValue}
          filterValue2={filterValue2}
          onChange={onFilterChange}
          onChange2={onFilterChange2}
          type={filterType}
          options={filterOptions}
          groups={filterGroups}
          label={label}
        />
      </div>
    </th>
  )
}

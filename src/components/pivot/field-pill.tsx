'use client'

import { useRef, useState } from 'react'
import { PivotFilterDropdown } from './pivot-filter-dropdown'

interface FieldPillProps {
  fieldKey: string
  label: string
  zone?: 'rows' | 'cols' | 'reportFilters' | 'available'
  isFiltered?: boolean
  onRemove?: () => void
  onDragStart?: (e: React.DragEvent) => void
  // Filter props — only needed when pill lives in a drop zone
  uniqueValues?: string[]
  activeFilterValues?: string[]
  onFilter?: (values: string[]) => void
  onClearFilter?: () => void
}

const ZONE_COLORS: Record<string, string> = {
  rows: 'bg-blue-100 text-blue-800 border-blue-200',
  cols: 'bg-pink-100 text-pink-800 border-pink-200',
  reportFilters: 'bg-amber-100 text-amber-800 border-amber-200',
  available: 'bg-muted text-foreground border-border',
}

export function FieldPill({
  fieldKey,
  label,
  zone = 'available',
  isFiltered,
  onRemove,
  onDragStart,
  uniqueValues,
  activeFilterValues,
  onFilter,
  onClearFilter,
}: FieldPillProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const canFilter = !!onFilter && !!uniqueValues && uniqueValues.length > 0

  return (
    <span
      draggable
      onDragStart={onDragStart}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-xs font-medium cursor-grab active:cursor-grabbing select-none ${ZONE_COLORS[zone]}`}
      data-field-key={fieldKey}
    >
      {label}

      {canFilter && (
        <span className="relative inline-flex">
          <button
            ref={triggerRef}
            onClick={e => { e.stopPropagation(); setFilterOpen(v => !v) }}
            className={`leading-none px-0.5 rounded transition-colors ${isFiltered ? 'text-indigo-600 hover:text-indigo-800' : 'opacity-40 hover:opacity-80'}`}
            aria-label={`Filter ${label}`}
            title={`Filter ${label}`}
          >
            {isFiltered ? '▼' : '▽'}
          </button>
          <PivotFilterDropdown
            fieldKey={fieldKey}
            fieldLabel={label}
            uniqueValues={uniqueValues}
            activeValues={activeFilterValues ?? []}
            onApply={onFilter}
            onClear={onClearFilter ?? (() => {})}
            isOpen={filterOpen}
            onOpen={() => setFilterOpen(true)}
            onClose={() => setFilterOpen(false)}
            anchorRef={triggerRef}
          />
        </span>
      )}

      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
          aria-label={`Remove ${label}`}
          title={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  )
}

'use client'

import { useState } from 'react'
import { FIELD_DEFINITIONS } from '@/lib/pivot/field-definitions'
import { FieldPill } from './field-pill'
import { DropZone } from './drop-zone'
import { PivotFilterDropdown } from './pivot-filter-dropdown'
import type { FieldDef } from '@/lib/pivot/types'
import { cn } from '@/lib/utils'

interface PivotFieldBarProps {
  rows: string[]
  cols: string[]
  reportFilters: string[]
  filterValues: Record<string, string[]>
  onDrop: (key: string, from: string, to: string) => void
  onRemove: (key: string, from: string) => void
  onSetFilter: (key: string, values: string[]) => void
  onClearFilter: (key: string) => void
  uniqueValues: Record<string, string[]>
}

const FIELD_GROUP_ORDER = ['Time', 'Categories & Tax', 'Parties', 'Projects', 'Other']

export function PivotFieldBar({
  rows,
  cols,
  reportFilters,
  filterValues,
  onDrop,
  onRemove,
  onSetFilter,
  onClearFilter,
  uniqueValues,
}: PivotFieldBarProps) {
  const [openFilterField, setOpenFilterField] = useState<string | null>(null)
  const [fieldsOpen, setFieldsOpen] = useState(true)

  const usedKeys = new Set([...rows, ...cols, ...reportFilters])
  const availableFields = FIELD_DEFINITIONS.filter(f => !usedKeys.has(f.key))

  const grouped: Record<string, FieldDef[]> = {}
  for (const f of availableFields) {
    if (!grouped[f.group]) grouped[f.group] = []
    grouped[f.group].push(f)
  }

  return (
    <div className="border-b bg-background">
      {/* Available Fields — collapsible accordion, groups stacked vertically */}
      <div className="border-b">
        <button
          type="button"
          onClick={() => setFieldsOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/40 transition-colors"
        >
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fields</span>
          <svg
            className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform duration-150', fieldsOpen ? 'rotate-180' : '')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {fieldsOpen && (
          <div className="px-4 pb-3 pt-1">
            {availableFields.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">All fields in use</p>
            ) : (
              <div className="flex flex-col gap-2">
                {FIELD_GROUP_ORDER.filter(g => grouped[g]?.length).map(groupName => (
                  <div key={groupName} className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">{groupName}</span>
                    <div className="flex flex-wrap gap-1">
                      {grouped[groupName].map(f => (
                        <FieldPill
                          key={f.key}
                          fieldKey={f.key}
                          label={f.label}
                          zone="available"
                          onDragStart={e => {
                            e.dataTransfer.setData('text/plain', JSON.stringify({ key: f.key, from: 'available' }))
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drop Zones */}
      <div className="px-4 py-3 grid grid-cols-3 gap-3">
        <DropZone
          zone="rows"
          label="Rows"
          fields={rows}
          fieldDefs={FIELD_DEFINITIONS}
          filterValues={filterValues}
          onDrop={(key, from) => onDrop(key, from, 'rows')}
          onRemove={key => onRemove(key, 'rows')}
          onFieldDragStart={() => {}}
        />
        <DropZone
          zone="cols"
          label="Columns"
          fields={cols}
          fieldDefs={FIELD_DEFINITIONS}
          filterValues={filterValues}
          onDrop={(key, from) => onDrop(key, from, 'cols')}
          onRemove={key => onRemove(key, 'cols')}
          onFieldDragStart={() => {}}
        />
        <DropZone
          zone="reportFilters"
          label="Report Filters"
          fields={reportFilters}
          fieldDefs={FIELD_DEFINITIONS}
          filterValues={filterValues}
          onDrop={(key, from) => onDrop(key, from, 'reportFilters')}
          onRemove={key => onRemove(key, 'reportFilters')}
          onFieldDragStart={() => {}}
        />
      </div>

      {/* Report Filter selectors — same multi-select dropdown as table headers */}
      {reportFilters.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-3">
          {reportFilters.map(key => {
            const fd = FIELD_DEFINITIONS.find(f => f.key === key)
            const activeValues = filterValues[key] ?? []
            const isFiltered = activeValues.length > 0
            return (
              <div key={key} className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">{fd?.label ?? key}:</span>
                <div className="relative inline-flex items-center">
                  <button
                    className={`inline-flex items-center gap-1 px-2 py-1 text-sm border rounded-md bg-background hover:bg-muted transition-colors ${isFiltered ? 'border-indigo-400 text-indigo-700 font-medium' : 'text-foreground'}`}
                    onClick={() => setOpenFilterField(openFilterField === key ? null : key)}
                  >
                    {isFiltered ? `${activeValues.length} selected` : '(All)'}
                    <span className="text-xs">{isFiltered ? '▼' : '▽'}</span>
                  </button>
                  <PivotFilterDropdown
                    fieldKey={key}
                    fieldLabel={fd?.label ?? key}
                    uniqueValues={uniqueValues[key] ?? []}
                    activeValues={activeValues}
                    onApply={v => onSetFilter(key, v)}
                    onClear={() => onClearFilter(key)}
                    isOpen={openFilterField === key}
                    onOpen={() => setOpenFilterField(key)}
                    onClose={() => setOpenFilterField(null)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

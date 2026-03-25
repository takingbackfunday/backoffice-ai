'use client'

import { FIELD_DEFINITIONS } from '@/lib/pivot/field-definitions'
import { FieldPill } from './field-pill'
import { DropZone } from './drop-zone'
import type { FieldDef } from '@/lib/pivot/types'

interface PivotFieldBarProps {
  rows: string[]
  cols: string[]
  reportFilters: string[]
  filterValues: Record<string, string[]>
  onDrop: (key: string, from: string, to: string) => void
  onRemove: (key: string, from: string) => void
  onReportFilterChange: (key: string, value: string) => void
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
  onReportFilterChange,
  uniqueValues,
}: PivotFieldBarProps) {
  const usedKeys = new Set([...rows, ...cols, ...reportFilters])
  const availableFields = FIELD_DEFINITIONS.filter(f => !usedKeys.has(f.key))

  const grouped: Record<string, FieldDef[]> = {}
  for (const f of availableFields) {
    if (!grouped[f.group]) grouped[f.group] = []
    grouped[f.group].push(f)
  }

  function handleFieldDragStart(key: string, from: string) {
    // drag state is encoded in dataTransfer; nothing extra needed here
    void key; void from
  }

  function handleDrop(key: string, from: string, to: string) {
    onDrop(key, from, to)
  }

  return (
    <div className="border-b bg-background">
      {/* Available Fields */}
      <div className="px-4 py-3 border-b">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Available Fields</div>
        {availableFields.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">All fields in use</p>
        ) : (
          <div className="space-y-2">
            {FIELD_GROUP_ORDER.filter(g => grouped[g]?.length).map(groupName => (
              <div key={groupName} className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground mt-1 w-28 shrink-0">{groupName}</span>
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

      {/* Drop Zones */}
      <div className="px-4 py-3 grid grid-cols-3 gap-3">
        <DropZone
          zone="rows"
          label="Rows"
          fields={rows}
          fieldDefs={FIELD_DEFINITIONS}
          filterValues={filterValues}
          onDrop={(key, from) => handleDrop(key, from, 'rows')}
          onRemove={key => onRemove(key, 'rows')}
          onFieldDragStart={handleFieldDragStart}
        />
        <DropZone
          zone="cols"
          label="Columns"
          fields={cols}
          fieldDefs={FIELD_DEFINITIONS}
          filterValues={filterValues}
          onDrop={(key, from) => handleDrop(key, from, 'cols')}
          onRemove={key => onRemove(key, 'cols')}
          onFieldDragStart={handleFieldDragStart}
        />
        <DropZone
          zone="reportFilters"
          label="Report Filters"
          fields={reportFilters}
          fieldDefs={FIELD_DEFINITIONS}
          filterValues={filterValues}
          onDrop={(key, from) => handleDrop(key, from, 'reportFilters')}
          onRemove={key => onRemove(key, 'reportFilters')}
          onFieldDragStart={handleFieldDragStart}
        />
      </div>

      {/* Report Filter Selectors */}
      {reportFilters.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-3">
          {reportFilters.map(key => {
            const fd = FIELD_DEFINITIONS.find(f => f.key === key)
            const vals = uniqueValues[key] ?? []
            const current = filterValues[key]?.[0] ?? ''
            return (
              <div key={key} className="flex items-center gap-1.5">
                <label htmlFor={`rf-${key}`} className="text-sm text-muted-foreground">{fd?.label ?? key}:</label>
                <select
                  id={`rf-${key}`}
                  value={current}
                  onChange={e => onReportFilterChange(key, e.target.value)}
                  className="text-sm border rounded px-2 h-8 bg-background"
                >
                  <option value="">(All)</option>
                  {vals.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

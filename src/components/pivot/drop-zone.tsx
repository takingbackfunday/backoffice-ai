'use client'

import { useState } from 'react'
import { FieldPill } from './field-pill'
import type { FieldDef } from '@/lib/pivot/types'

interface DropZoneProps {
  zone: 'rows' | 'cols' | 'reportFilters'
  label: string
  fields: string[]
  fieldDefs: FieldDef[]
  filterValues: Record<string, string[]>
  onDrop: (key: string, from: string) => void
  onRemove: (key: string) => void
  onFieldDragStart: (key: string, from: string) => void
}

const ZONE_BORDER: Record<string, string> = {
  rows: 'border-blue-300 bg-blue-50/50',
  cols: 'border-pink-300 bg-pink-50/50',
  reportFilters: 'border-amber-300 bg-amber-50/50',
}

const ZONE_HIGHLIGHT: Record<string, string> = {
  rows: 'border-blue-500 bg-blue-100/60',
  cols: 'border-pink-500 bg-pink-100/60',
  reportFilters: 'border-amber-500 bg-amber-100/60',
}

export function DropZone({ zone, label, fields, fieldDefs, filterValues, onDrop, onRemove, onFieldDragStart }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const getLabel = (key: string) => fieldDefs.find(f => f.key === key)?.label ?? key

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-3 min-h-[80px] transition-colors ${isDragOver ? ZONE_HIGHLIGHT[zone] : ZONE_BORDER[zone]}`}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setIsDragOver(false)
        try {
          const { key, from } = JSON.parse(e.dataTransfer.getData('text/plain'))
          if (from !== zone) onDrop(key, from)
        } catch {}
      }}
    >
      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{label}</div>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Drag fields here</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {fields.map(key => (
            <FieldPill
              key={key}
              fieldKey={key}
              label={getLabel(key)}
              zone={zone}
              isFiltered={(filterValues[key]?.length ?? 0) > 0}
              onRemove={() => onRemove(key)}
              onDragStart={e => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ key, from: zone }))
                onFieldDragStart(key, zone)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useRef } from 'react'
import type { CategoryGroup } from '@/components/rules/rule-editor'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { useOutsideClick } from '@/hooks/use-outside-click'
import { FunnelIcon } from '../cells/funnel-icon'

export function ColumnFilterPopover({
  column,
  isOpen,
  onOpen,
  onClose,
  filterValue,
  filterValue2,
  onChange,
  onChange2,
  type,
  options,
  groups,
  label,
}: {
  column: string
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  filterValue: string
  filterValue2?: string
  onChange: (v: string) => void
  onChange2?: (v: string) => void
  type: 'text' | 'select' | 'optgroup-select' | 'amount-range' | 'date'
  options?: { value: string; label: string }[]
  groups?: CategoryGroup[]
  label: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const isActive = Boolean(filterValue || filterValue2)

  useOutsideClick(wrapRef, onClose, { enabled: isOpen })

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        onMouseDown={(e) => { e.stopPropagation(); isOpen ? onClose() : onOpen() }}
        className="p-0.5 rounded hover:bg-black/10 transition-colors"
        aria-label={`Filter by ${label}`}
        title={`Filter by ${label}`}
      >
        <FunnelIcon active={isActive} />
      </button>
      <PortalDropdown anchorRef={wrapRef} open={isOpen}>
        <div className="bg-white border border-black/10 rounded-lg shadow-lg p-2 min-w-[160px] whitespace-normal">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
          {type === 'text' && (
            <input
              autoFocus
              type="text"
              value={filterValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder="contains…"
              className="w-full text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
            />
          )}
          {type === 'select' && options && (
            <select
              autoFocus
              value={filterValue}
              onChange={(e) => { onChange(e.target.value); onClose() }}
              className="w-full text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
            >
              <option value="">— All —</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          {type === 'optgroup-select' && groups && (
            <select
              autoFocus
              value={filterValue}
              onChange={(e) => { onChange(e.target.value); onClose() }}
              className="w-full text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
            >
              <option value="">— All —</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {type === 'amount-range' && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground w-6 shrink-0">Min</label>
                <input
                  autoFocus
                  type="number"
                  value={filterValue}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 min-w-0 text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground w-6 shrink-0">Max</label>
                <input
                  type="number"
                  value={filterValue2 ?? ''}
                  onChange={(e) => onChange2?.(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 min-w-0 text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                />
              </div>
            </div>
          )}
          {type === 'date' && (
            <div className="text-xs text-muted-foreground italic">Use date column header</div>
          )}
          {filterValue && (
            <button
              onMouseDown={(e) => { e.stopPropagation(); onChange(''); onChange2?.('') }}
              className="mt-1.5 text-[10px] text-[#534AB7] hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </PortalDropdown>
    </div>
  )
}

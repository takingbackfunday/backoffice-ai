'use client'

import React, { useRef } from 'react'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { usePortalOutsideClick } from '@/hooks/use-portal-outside-click'
import { FunnelIcon } from '../cells/funnel-icon'

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDir = 'asc' | 'desc'

export function DateFilterHeader({
  sortBy,
  sortDir,
  onSort,
  dateFrom,
  dateTo,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onApplyPreset,
  onApplyCustom,
  onClear,
  openFilterCol,
  setOpenFilterCol,
}: {
  sortBy: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  dateFrom: string
  dateTo: string
  customFrom: string
  customTo: string
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
  onApplyPreset: (preset: 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'ytd') => void
  onApplyCustom: () => void
  onClear: () => void
  openFilterCol: string | null
  setOpenFilterCol: (col: string | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const isOpen = openFilterCol === 'date'
  const isActive = Boolean(dateFrom || dateTo)
  const isSortActive = sortBy === 'date'

  usePortalOutsideClick(wrapRef, () => setOpenFilterCol(null), { enabled: isOpen })

  return (
    <th className="px-3 py-1 text-left font-medium whitespace-nowrap relative">
      <div className="flex items-center gap-1" ref={wrapRef}>
        <span
          className="cursor-pointer select-none hover:text-foreground"
          onClick={() => onSort('date')}
          aria-sort={isSortActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          Date{isSortActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
        </span>
        <button
          onMouseDown={(e) => { e.stopPropagation(); isOpen ? setOpenFilterCol(null) : setOpenFilterCol('date') }}
          className="p-0.5 rounded hover:bg-black/10 transition-colors"
          aria-label="Filter by date"
          title="Filter by date"
        >
          <FunnelIcon active={isActive} />
        </button>
        <PortalDropdown anchorRef={wrapRef} open={isOpen}>
          <div className="bg-white border border-black/10 rounded-lg shadow-lg w-52 p-3 space-y-3 whitespace-normal">
            <div className="space-y-1">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Quick select</p>
              {([
                ['this-month', 'This month'],
                ['last-month', 'Last month'],
                ['last-3-months', 'Last 3 months'],
                ['last-6-months', 'Last 6 months'],
                ['ytd', 'Year to date'],
              ] as const).map(([preset, lbl]) => (
                <button
                  key={preset}
                  onMouseDown={(e) => { e.stopPropagation(); onApplyPreset(preset); setOpenFilterCol(null) }}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="border-t border-black/5 pt-3 space-y-2">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Custom range</p>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => onCustomFromChange(e.target.value)}
                className="w-full text-xs border border-black/15 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => onCustomToChange(e.target.value)}
                className="w-full text-xs border border-black/15 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
              />
              <button
                onMouseDown={(e) => { e.stopPropagation(); onApplyCustom(); setOpenFilterCol(null) }}
                disabled={!customFrom && !customTo}
                className="w-full text-xs py-1.5 rounded-md bg-[#3C3489] text-[#EEEDFE] hover:bg-[#2d2770] disabled:opacity-40 transition-colors"
              >
                Apply
              </button>
            </div>
            {isActive && (
              <button
                onMouseDown={(e) => { e.stopPropagation(); onClear(); setOpenFilterCol(null) }}
                className="text-[10px] text-[#534AB7] hover:underline"
              >
                Clear date filter
              </button>
            )}
          </div>
        </PortalDropdown>
      </div>
    </th>
  )
}

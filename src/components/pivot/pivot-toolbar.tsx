'use client'

import { useState, useRef, useEffect } from 'react'
import type { ViewMode } from '@/lib/pivot/types'
import { PIVOT_PRESETS } from '@/lib/pivot/presets'
import type { PivotConfig } from '@/lib/pivot/types'

interface PivotToolbarProps {
  viewMode: ViewMode
  showSubtotals: boolean
  showGrandTotals: boolean
  truncateNumbers: boolean
  rowCount: number
  filteredCount: number
  totalCount: number
  onViewMode: (v: ViewMode) => void
  onShowSubtotals: (v: boolean) => void
  onShowGrandTotals: (v: boolean) => void
  onTruncateNumbers: (v: boolean) => void
  onApplyPreset: (config: Partial<PivotConfig>) => void
  onExport: () => void
}

export function PivotToolbar({
  viewMode,
  showSubtotals,
  showGrandTotals,
  truncateNumbers,
  rowCount,
  filteredCount,
  totalCount,
  onViewMode,
  onShowSubtotals,
  onShowGrandTotals,
  onTruncateNumbers,
  onApplyPreset,
  onExport,
}: PivotToolbarProps) {
  const [presetsOpen, setPresetsOpen] = useState(false)
  const presetsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!presetsOpen) return
    function handler(e: MouseEvent) {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setPresetsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [presetsOpen])

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b bg-background">
      {/* View mode toggle */}
      <div className="flex items-center rounded-md border overflow-hidden text-sm">
        <button
          onClick={() => onViewMode('outline')}
          className={`px-3 h-9 transition-colors ${viewMode === 'outline' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
        >
          Outline
        </button>
        <button
          onClick={() => onViewMode('tabular')}
          className={`px-3 h-9 border-l transition-colors ${viewMode === 'tabular' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
        >
          Tabular
        </button>
      </div>

      {/* Subtotals (outline only) */}
      {viewMode === 'outline' && rowCount >= 2 && (
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-indigo-600"
            checked={showSubtotals}
            onChange={e => onShowSubtotals(e.target.checked)}
          />
          Subtotals
        </label>
      )}

      {/* Grand totals */}
      <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-4 h-4 accent-indigo-600"
          checked={showGrandTotals}
          onChange={e => onShowGrandTotals(e.target.checked)}
        />
        Grand Totals
      </label>

      {/* Truncate toggle */}
      <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-4 h-4 accent-indigo-600"
          checked={truncateNumbers}
          onChange={e => onTruncateNumbers(e.target.checked)}
        />
        No decimals
      </label>

      {/* Presets */}
      <div className="relative" ref={presetsRef}>
        <button
          onClick={() => setPresetsOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 h-9 text-sm border rounded-md hover:bg-muted transition-colors"
        >
          ⚡ Presets
        </button>
        {presetsOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-background border rounded-lg shadow-lg w-72 p-2">
            {PIVOT_PRESETS.map(preset => (
              <button
                key={preset.name}
                onClick={() => { onApplyPreset(preset.config); setPresetsOpen(false) }}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span>{preset.icon}</span>
                  <span className="text-sm font-medium">{preset.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 pl-6">{preset.description}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <button
        onClick={onExport}
        className="flex items-center gap-1.5 px-3 h-9 text-sm border rounded-md hover:bg-muted transition-colors ml-auto"
        title="Export current view to CSV"
      >
        ⬇ Export CSV
      </button>

      {/* Record count */}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} transactions
      </span>
    </div>
  )
}

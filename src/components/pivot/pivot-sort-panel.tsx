'use client'

import { useState, useRef, useEffect } from 'react'
import type { SortRule, SortDirection } from '@/lib/pivot/types'
import { FIELD_DEFINITIONS } from '@/lib/pivot/field-definitions'

interface PivotSortPanelProps {
  rows: string[]
  cols: string[]
  sortRules: SortRule[]
  onSortRulesChange: (rules: SortRule[]) => void
}

function getLabel(key: string) {
  if (key === '__value__') return 'Value (Total)'
  return FIELD_DEFINITIONS.find(f => f.key === key)?.label ?? key
}

function isValueField(key: string) {
  return key === '__value__'
}

export function PivotSortPanel({ rows, cols, sortRules, onSortRulesChange }: PivotSortPanelProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const fieldOptions = [
    ...rows.map(k => ({ key: k, label: getLabel(k), group: 'Rows' })),
    ...cols.map(k => ({ key: k, label: getLabel(k), group: 'Columns' })),
    { key: '__value__', label: 'Value (Total)', group: 'Values' },
  ]

  const hasRules = sortRules.length > 0

  function updateRule(idx: number, patch: Partial<SortRule>) {
    const next = sortRules.map((r, i) => i === idx ? { ...r, ...patch } : r)
    onSortRulesChange(next)
  }

  function removeRule(idx: number) {
    onSortRulesChange(sortRules.filter((_, i) => i !== idx))
  }

  function addRule() {
    const usedFields = new Set(sortRules.map(r => r.field))
    const next = fieldOptions.find(f => !usedFields.has(f.key))
    if (!next) return
    onSortRulesChange([...sortRules, { field: next.key, direction: 'asc' }])
  }

  const canAddMore = sortRules.length < 3 && sortRules.length < fieldOptions.length

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 px-2.5 h-8 text-xs border rounded-md transition-colors whitespace-nowrap ${hasRules ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'hover:bg-muted'}`}
        title="Sort"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" d="M2 4h12M4 8h8M6 12h4" />
        </svg>
        Sort{hasRules ? ` (${sortRules.length})` : ''}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-background border rounded-lg shadow-lg w-80 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sort order</span>
            {hasRules && (
              <button
                onClick={() => onSortRulesChange([])}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </button>
            )}
          </div>

          {sortRules.length === 0 && (
            <p className="text-xs text-muted-foreground italic mb-2">No sort applied — default order</p>
          )}

          <div className="flex flex-col gap-2">
            {sortRules.map((rule, idx) => {
              const isVal = isValueField(rule.field)
              return (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground w-12 shrink-0">
                    {idx === 0 ? 'Sort by' : 'then by'}
                  </span>
                  <select
                    value={rule.field}
                    onChange={e => updateRule(idx, { field: e.target.value, direction: 'asc' })}
                    className="flex-1 text-xs border rounded px-1.5 h-7 bg-background min-w-0"
                  >
                    {fieldOptions.map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                  <select
                    value={rule.direction}
                    onChange={e => updateRule(idx, { direction: e.target.value as SortDirection })}
                    className="text-xs border rounded px-1.5 h-7 bg-background w-36 shrink-0"
                  >
                    {isVal ? (
                      <>
                        <option value="asc">Smallest → Largest</option>
                        <option value="desc">Largest → Smallest</option>
                      </>
                    ) : (
                      <>
                        <option value="asc">A → Z</option>
                        <option value="desc">Z → A</option>
                      </>
                    )}
                  </select>
                  <button
                    onClick={() => removeRule(idx)}
                    className="text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 shrink-0"
                    aria-label="Remove sort level"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>

          {canAddMore && (
            <button
              onClick={addRule}
              className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              + Add level
            </button>
          )}
        </div>
      )}
    </div>
  )
}

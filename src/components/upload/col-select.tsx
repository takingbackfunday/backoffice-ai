'use client'

import { useMemo } from 'react'

export type ColValidation = { col: string | null; confidence: number; reason: string }
export type ValValidation = { value: string; confidence: number; reason: string }
export type MappingValidation = Record<'dateCol' | 'amountCol' | 'descCol' | 'notesCol', ColValidation> & {
  dateFormat?: ValValidation
  amountSign?: ValValidation
}

export function ColSelect({
  id,
  label,
  value,
  headers,
  onChange,
  validation,
  candidates,
  required,
}: {
  id: string
  label: string
  value: string | undefined
  headers: string[]
  onChange: (v: string | undefined) => void
  validation?: ColValidation
  candidates?: { col: string; score: number }[]
  required?: boolean
}) {
  const suggestions = useMemo(() => {
    const map = new Map<string, number>()
    if (validation?.col && validation.confidence > 0) {
      map.set(validation.col, validation.confidence)
    }
    for (const c of candidates ?? []) {
      if (!map.has(c.col)) map.set(c.col, Math.round(c.score * 100))
    }
    return Array.from(map.entries())
      .map(([col, pct]) => ({ col, pct }))
      .sort((a, b) => b.pct - a.pct)
  }, [candidates, validation])

  const suggestedKeys = new Set(suggestions.map((s) => s.col))
  const otherHeaders = headers.filter((h) => !suggestedKeys.has(h))
  const needsThrob = required && !value

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium mb-1">{label}</label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={`w-full rounded-md border px-3 py-1.5 text-sm${needsThrob ? ' col-throb' : ''}`}
        data-testid={id}
      >
        <option value="">— select —</option>
        {suggestions.length > 0 ? (
          <>
            <optgroup label="Suggested">
              {suggestions.map((s) => (
                <option key={s.col} value={s.col}>{s.col} — {s.pct}%</option>
              ))}
            </optgroup>
            {otherHeaders.length > 0 && (
              <optgroup label="All columns">
                {otherHeaders.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </optgroup>
            )}
          </>
        ) : (
          headers.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))
        )}
      </select>
    </div>
  )
}

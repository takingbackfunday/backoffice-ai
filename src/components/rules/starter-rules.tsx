'use client'

import { useEffect, useState } from 'react'
import type { ScoredStarterRule } from '@/lib/rules/score-starter-rules'

const GROUP_LABELS: Record<string, string> = {
  payee: 'By merchant',
  category: 'By pattern',
}

export function StarterRules({ onInstalled }: { onInstalled?: (count: number) => void }) {
  const [rules, setRules] = useState<ScoredStarterRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/rules/starter')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        const scored: ScoredStarterRule[] = json.data ?? []
        setRules(scored)
        // Pre-select all not-yet-installed rules
        setSelected(new Set(scored.filter((s) => !s.alreadyInstalled).map((s) => s.def.id)))
      })
      .catch(() => setError('Failed to load starter rules'))
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function install() {
    const ids = Array.from(selected)
    if (!ids.length) return
    setInstalling(true)
    try {
      const res = await fetch('/api/rules/starter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Install failed')
      const installed: number = json.data?.installed ?? 0
      if (installed === 0) {
        setError('No rules were installed — the target categories may not exist in your category list yet.')
        return
      }
      setDone(true)
      onInstalled?.(installed)
    } catch {
      setError('Failed to install rules')
    } finally {
      setInstalling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <span className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        Loading starter rules…
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-600 py-2">{error}</p>
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#085041] bg-[#E1F5EE] rounded-lg px-4 py-3">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Starter rules installed! They'll run on every future import.
      </div>
    )
  }

  if (rules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No starter rules match your category setup. Add categories first.
      </p>
    )
  }

  // Group for display
  const byGroup = rules.reduce<Record<string, ScoredStarterRule[]>>((acc, s) => {
    const g = s.def.group
    ;(acc[g] ??= []).push(s)
    return acc
  }, {})

  const newCount = Array.from(selected).filter((id) => {
    const rule = rules.find((r) => r.def.id === id)
    return rule && !rule.alreadyInstalled
  }).length

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Starter rules</h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          One-click rules for common merchants and patterns. Grayed-out rules are already installed.
        </p>
      </div>

      {Object.entries(byGroup).map(([group, items]) => (
        <div key={group}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            {GROUP_LABELS[group] ?? group}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((s) => {
              const isInstalled = s.alreadyInstalled
              const isSelected = selected.has(s.def.id)
              return (
                <button
                  key={s.def.id}
                  onClick={() => !isInstalled && toggle(s.def.id)}
                  disabled={isInstalled}
                  title={isInstalled ? 'Already installed' : `${s.def.name} → ${s.categoryName}`}
                  className={[
                    'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                    isInstalled
                      ? 'border-black/10 bg-gray-50 text-muted-foreground cursor-default opacity-50'
                      : isSelected
                        ? 'border-[#534AB7]/50 bg-[#EEEDFE] text-[#3C3489] hover:bg-[#e5e3fd]'
                        : 'border-black/15 bg-white text-[#444] hover:border-[#534AB7]/40 hover:bg-[#FAFAFE]',
                  ].join(' ')}
                >
                  {isInstalled && (
                    <span className="mr-1 text-[10px]">✓</span>
                  )}
                  {s.def.name.replace(/ →.*/, '')}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={install}
          disabled={installing || newCount === 0}
          className="rounded-md bg-[#3C3489] px-4 py-1.5 text-sm font-medium text-[#EEEDFE] hover:bg-[#2d2770] disabled:opacity-50 transition-colors"
        >
          {installing
            ? 'Installing…'
            : newCount === 0
              ? 'No new rules selected'
              : `Install ${newCount} rule${newCount !== 1 ? 's' : ''}`}
        </button>
        {newCount > 0 && !installing && (
          <button
            onClick={() => setSelected(new Set())}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Deselect all
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { Workspace } from '@/generated/prisma/client'
import { SuggestionCard, type PersistedSuggestion } from './rules-agent'
import type { CategoryGroup, Payee, UserRule } from './rule-types'

/**
 * "Rule suggestions from your recent edits" banner. Shown only when AI rule
 * suggestions are enabled (the parent gates rendering on the preference).
 */
export function RuleSuggestionsPanel({
  suggestions,
  categoryGroups,
  payees,
  projects,
  accounts,
  onAccepted,
  onIgnoreAll,
  onApplyComplete,
  onPayeeCreated,
  showToast,
}: {
  suggestions: PersistedSuggestion[]
  categoryGroups: CategoryGroup[]
  payees: Payee[]
  projects: Workspace[]
  accounts?: { id: string; name: string }[]
  onAccepted: (rule: UserRule) => void
  onIgnoreAll: () => void
  onApplyComplete?: (result: { updated: number; total: number } | null) => void
  onPayeeCreated?: (p: Payee) => void
  showToast: (message: string, type?: 'success' | 'error') => void
}) {
  const [open, setOpen] = useState(true)
  const [ignoringAll, setIgnoringAll] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set())

  if (suggestions.length === 0) return null
  const remaining = suggestions.length - dismissedIds.size

  async function ignoreAll() {
    setIgnoringAll(true)
    const res = await fetch('/api/rules/suggestions', { method: 'DELETE' })
    if (res.ok) onIgnoreAll()
    setIgnoringAll(false)
  }

  return (
    <div className="rounded-xl border border-[#534AB7]/25 bg-[#FAFAFE] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#EEEDFE]/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[13px]">💡</span>
          <div>
            <span className="text-sm font-medium text-[#3C3489]">
              {remaining} rule suggestion{remaining !== 1 ? 's' : ''} from your recent edits
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Review and accept to automate these patterns</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ignoreAll() }}
            disabled={ignoringAll}
            className="text-[11px] text-muted-foreground hover:text-foreground border border-black/15 rounded px-2 py-1 disabled:opacity-50"
          >
            {ignoringAll ? 'Ignoring…' : 'Ignore all'}
          </button>
          <svg
            className={`w-4 h-4 text-[#534AB7] transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[#534AB7]/10 divide-y divide-black/5">
          {suggestions.map((s, i) =>
            dismissedIds.has(i) ? null : (
              <div key={s.id} className="p-4">
                <SuggestionCard
                  suggestion={s}
                  index={i}
                  total={suggestions.length}
                  categoryGroups={categoryGroups}
                  payees={payees}
                  projects={projects}
                  accounts={accounts}
                  onAccepted={(rule) => {
                    onAccepted(rule)
                    setDismissedIds((d) => new Set(d).add(i))
                    showToast(`Rule accepted — ${rule.categoryName ?? rule.name}`)
                  }}
                  onDecline={() => setDismissedIds((d) => new Set(d).add(i))}
                  onApplyComplete={onApplyComplete}
                  onPayeeCreated={onPayeeCreated}
                />
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

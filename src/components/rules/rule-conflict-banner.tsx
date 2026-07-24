'use client'

import type { RuleConflict } from '@/lib/rules/rule-conflicts'

const MAX_SHOWN = 3

/**
 * Non-blocking warning shown in the rule editor when the candidate rule
 * duplicates, conflicts with, overlaps, or is shadowed by existing rules.
 * Saving is always allowed — first matching rule wins.
 */
export function RuleConflictBanner({ conflicts }: { conflicts: RuleConflict[] }) {
  if (conflicts.length === 0) return null
  const shown = conflicts.slice(0, MAX_SHOWN)
  const extra = conflicts.length - shown.length

  return (
    <div className="mx-3 mb-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2" role="alert">
      <p className="text-[11px] font-semibold text-amber-800 mb-0.5">
        ⚠ {conflicts.length === 1 ? 'This rule overlaps an existing rule' : `This rule overlaps ${conflicts.length} existing rules`}
      </p>
      <ul className="space-y-0.5">
        {shown.map((c) => (
          <li key={`${c.kind}-${c.otherRuleId}`} className="text-[11px] text-amber-800/90 leading-snug">
            {c.explanation}
          </li>
        ))}
        {extra > 0 && (
          <li className="text-[11px] text-amber-800/70">…and {extra} more</li>
        )}
      </ul>
      <p className="text-[10px] text-amber-700/70 mt-1">You can still save — the first matching rule wins.</p>
    </div>
  )
}

'use client'

import type { RuleConflict } from '@/lib/rules/rule-conflicts'
import type { UserRule } from './rule-types'

function fmtRuleDate(d: string | Date | undefined): string {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

const FIELD_LABELS: Record<string, string> = {
  description: 'Description', payeeName: 'Payee',
  rawDescription: 'Raw description', amount: 'Amount', currency: 'Currency',
}

const OPERATOR_LABELS: Record<string, string> = {
  contains: 'contains', equals: 'equals', starts_with: 'starts with',
  regex: 'matches regex', gt: '>', lt: '<', gte: '≥', lte: '≤',
  in: 'is one of', oneOf: 'is one of',
}

function ConflictBadge({ conflicts }: { conflicts: RuleConflict[] }) {
  const hard = conflicts.some((c) => c.kind === 'conflict' || c.kind === 'shadowed')
  const tooltip = conflicts.map((c) => `• ${c.explanation}`).join('\n')
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium cursor-help ${
        hard ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}
      title={tooltip}
      data-testid="rule-conflict-badge"
    >
      ⚠ {conflicts.length > 1 ? conflicts.length : ''}
    </span>
  )
}

export function RuleCard({
  rule, onEdit, onDelete, onToggle, deleting, toggling, selected, onSelect, conflicts,
}: {
  rule: UserRule
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  deleting: boolean
  toggling: boolean
  selected: boolean
  onSelect: () => void
  conflicts?: RuleConflict[]
}) {
  const defs = rule.conditions.all ?? rule.conditions.any ?? []
  const joinWord = rule.conditions.any ? 'OR' : 'AND'

  return (
    <div className={`border border-black/10 rounded-lg px-3.5 py-2.5 bg-white transition-opacity ${deleting ? 'opacity-30' : !rule.isActive ? 'opacity-50' : ''} ${selected ? 'border-[#534AB7]/30 bg-[#EEEDFE]/20' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="cursor-pointer shrink-0"
          aria-label={`Select rule ${rule.name}`}
        />

        {/* Condition pills → action pills */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {/* Left: conditions stacked vertically */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            {defs.map((c, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className={`text-[10px] text-muted-foreground font-medium w-5 text-center shrink-0 ${i === 0 ? 'invisible' : ''}`}>{joinWord}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-[#E6F1FB] text-[#0C447C]">
                  <span className="font-medium">{FIELD_LABELS[c.field] ?? c.field}</span>
                  {' '}{OPERATOR_LABELS[c.operator] ?? c.operator}{' '}
                  {Array.isArray(c.value) ? c.value.join(', ') : `"${c.value}"`}
                </span>
              </div>
            ))}
            {defs.length === 0 && (
              <span className="text-xs text-muted-foreground">(no conditions)</span>
            )}
          </div>

          {/* Arrow */}
          <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>

          {/* Right: actions stacked vertically */}
          <div className="flex flex-col gap-1 flex-shrink-0">
            {(rule.categoryRef?.name ?? rule.categoryName) && (
              <span className="text-xs px-2 py-0.5 rounded bg-[#EEEDFE]">
                <span className="text-[#534AB7]/80">cat </span>
                <span className="text-[#3C3489] font-medium">{rule.categoryRef?.name ?? rule.categoryName}</span>
              </span>
            )}
            {rule.payee && (
              <span className="text-xs px-2 py-0.5 rounded bg-[#E1F5EE]">
                <span className="text-[#0F6E56]/80">payee </span>
                <span className="text-[#085041] font-medium">{rule.payee.name}</span>
              </span>
            )}
            {rule.workspace && (
              <span className="text-xs px-2 py-0.5 rounded bg-[#FEF3E2]">
                <span className="text-amber-600/80">proj </span>
                <span className="text-amber-800 font-medium">{rule.workspace.name}</span>
              </span>
            )}
            {!rule.categoryRef?.name && !rule.categoryName && !rule.payee && !rule.workspace && (
              <span className="text-xs text-muted-foreground">(no actions)</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {conflicts && conflicts.length > 0 && <ConflictBadge conflicts={conflicts} />}
          {rule.updatedAt && (
            <span className="text-[10px] text-muted-foreground/70 tabular-nums" title={new Date(rule.updatedAt).toLocaleString()}>
              {fmtRuleDate(rule.updatedAt)}
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">#{rule.priority}</span>

          <button onClick={onToggle} disabled={toggling}
            className={`relative inline-flex h-[18px] w-8 rounded-full transition-colors disabled:opacity-50 ${rule.isActive ? 'bg-[#085041]' : 'bg-gray-200'}`}
            aria-label={rule.isActive ? 'Disable rule' : 'Enable rule'}>
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[2px] ${rule.isActive ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
          </button>

          <button onClick={onEdit}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Edit rule" title="Edit">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <button onClick={onDelete} disabled={deleting}
            className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
            aria-label="Delete rule" title="Delete">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

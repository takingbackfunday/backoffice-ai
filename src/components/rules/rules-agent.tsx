'use client'

import { useState, useRef, useEffect } from 'react'
import type { Project } from '@prisma/client'
import { RuleEditor, type UserRule, type CategoryGroup, type Payee } from './rule-editor'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentSuggestion {
  conditions: {
    all?: { field: string; operator: string; value: string | number | string[] }[]
    any?: { field: string; operator: string; value: string | number | string[] }[]
  }
  categoryName: string
  categoryId: string | null
  payeeName: string | null
  payeeId: string | null
  confidence: 'high' | 'medium'
  impact: 'low' | 'medium' | 'high'
  reasoning: string
  matchCount: number
  totalAmount: number
  autoAccepted?: boolean
}

// Persisted suggestion from DB (has an id, accepted via /api/rules/suggestions/[id])
export interface PersistedSuggestion extends Omit<AgentSuggestion, 'autoAccepted'> {
  id: string
}

interface RulesAgentProps {
  categoryGroups: CategoryGroup[]
  payees: Payee[]
  projects: Project[]
  accounts?: { id: string; name: string }[]
  onRuleAccepted: (rule: unknown) => void
  onClose: (summary?: { uncategorised: number; noPayee: number }) => void
  onApplyComplete?: (result: { updated: number; total: number } | null) => void
}

// ── Suggestion → UserRule shape ───────────────────────────────────────────────

function suggestionToRule(s: AgentSuggestion, categoryGroups: CategoryGroup[]): UserRule {
  // Resolve categoryId from groups if the agent didn't supply one
  const allCats = categoryGroups.flatMap((g) => g.categories)
  const resolvedCat = s.categoryId
    ? allCats.find((c) => c.id === s.categoryId)
    : allCats.find((c) => c.name.toLowerCase() === s.categoryName.toLowerCase())
  return {
    id: '',
    name: '',
    priority: 50,
    categoryName: resolvedCat?.name ?? s.categoryName,
    categoryId: resolvedCat?.id ?? null,
    categoryRef: null,
    payeeId: s.payeeId,
    payee: s.payeeName ? { id: s.payeeId ?? '', name: s.payeeName } : null,
    projectId: null,
    project: null,
    conditions: s.conditions,
    isActive: true,
  }
}

// ── Auto-accept helper ────────────────────────────────────────────────────────

async function saveRule(s: AgentSuggestion, categoryGroups: CategoryGroup[]): Promise<UserRule | null> {
  const rule = suggestionToRule(s, categoryGroups)
  const res = await fetch('/api/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${s.categoryName}${s.payeeName ? ` — ${s.payeeName}` : ''} (auto)`,
      priority: 50,
      conditions: s.conditions,
      categoryId: rule.categoryId,
      categoryName: rule.categoryName,
      payeeName: s.payeeName ?? undefined,
      isActive: true,
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.data ?? null
}

function shouldAutoAccept(s: AgentSuggestion): boolean {
  return s.confidence === 'high' && s.impact !== 'high'
}

// ── SuggestionCard ─────────────────────────────────────────────────────────────

export function SuggestionCard({
  suggestion,
  index,
  total,
  categoryGroups,
  payees,
  projects,
  accounts,
  onAccepted,
  onDecline,
  onApplyComplete,
}: {
  suggestion: AgentSuggestion | PersistedSuggestion
  index: number
  total: number
  categoryGroups: CategoryGroup[]
  payees: Payee[]
  projects: Project[]
  accounts?: { id: string; name: string }[]
  onAccepted: (rule: UserRule, index: number) => void
  onDecline: () => void
  onApplyComplete?: (result: { updated: number; total: number } | null) => void
}) {
  const isPersisted = 'id' in suggestion

  const header = (
    <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-black/[0.07]">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[13px] font-medium text-[#666]">Suggestion {index + 1}/{total}</span>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
          suggestion.confidence === 'high'
            ? 'bg-[#E1F5EE] text-[#0F6E56]'
            : 'bg-yellow-100 text-yellow-700'
        }`}>
          {suggestion.confidence.toUpperCase()}
        </span>
        <span className="text-[12px] text-[#999]">~{suggestion.matchCount} txns</span>
        {isPersisted && (
          <span className="text-[10px] bg-[#EEEDFE] text-[#534AB7] px-1.5 py-px rounded-full">from edits</span>
        )}
      </div>
      <p className="text-[12px] text-[#666] text-right leading-snug">{suggestion.reasoning}</p>
    </div>
  )

  async function handleSave(rule: UserRule) {
    onAccepted(rule, index)
  }

  async function handleSaveOverride(shouldApply: boolean) {
    // For persisted suggestions: POST to accept API (creates the real rule) then optionally apply
    const res = await fetch(`/api/rules/suggestions/${(suggestion as PersistedSuggestion).id}`, { method: 'POST' })
    if (!res.ok) return
    const json = await res.json()
    onAccepted(json.data, index)
    if (shouldApply) {
      fetch('/api/rules/apply', { method: 'POST' })
        .then((r) => r.json().then((applyJson) => ({ ok: r.ok, applyJson })))
        .then(({ ok: applyOk, applyJson }) => {
          if (onApplyComplete) onApplyComplete(applyOk ? (applyJson.data ?? null) : null)
        })
        .catch(() => { if (onApplyComplete) onApplyComplete(null) })
    }
  }

  async function handleDecline() {
    if (isPersisted) {
      await fetch(`/api/rules/suggestions/${(suggestion as PersistedSuggestion).id}`, { method: 'DELETE' })
    }
    onDecline()
  }

  return (
    <RuleEditor
      projects={projects}
      payees={payees}
      accounts={accounts}
      categoryGroups={categoryGroups}
      editingRule={suggestionToRule(suggestion, categoryGroups)}
      onSave={handleSave}
      onCancel={handleDecline}
      saveLabel="Accept"
      cancelLabel="Decline"
      showSaveAndApply={true}
      onApplyComplete={onApplyComplete}
      cardHeader={header}
      onSaveOverride={isPersisted ? handleSaveOverride : undefined}
    />
  )
}

// ── Main RulesAgent ────────────────────────────────────────────────────────────

const THINKING_MESSAGES = [
  'Scanning transaction history…',
  'Grouping by payee and description…',
  'Looking for recurring patterns…',
  'Cross-referencing merchant names…',
  'Checking for uncategorised clusters…',
  'Consulting category library…',
  'Applying world knowledge to merchants…',
  'Filtering out existing rule coverage…',
  'Ranking suggestions by confidence…',
  'Almost there…',
]

export function RulesAgent({ categoryGroups, payees, projects, accounts, onRuleAccepted, onClose, onApplyComplete }: RulesAgentProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [statusMessages, setStatusMessages] = useState<string[]>([])
  const [thinkingIdx, setThinkingIdx] = useState(0)
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [doneSummary, setDoneSummary] = useState<{ uncategorised: number; noPayee: number } | undefined>(undefined)
  const esRef = useRef<EventSource | null>(null)
  const thinkingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const categoryGroupsRef = useRef<CategoryGroup[]>(categoryGroups)
  useEffect(() => { categoryGroupsRef.current = categoryGroups }, [categoryGroups])

  useEffect(() => {
    if (status === 'running') {
      setThinkingIdx(0)
      thinkingRef.current = setInterval(() => {
        setThinkingIdx((i) => (i + 1) % THINKING_MESSAGES.length)
      }, 2200)
    } else {
      if (thinkingRef.current) clearInterval(thinkingRef.current)
    }
    return () => { if (thinkingRef.current) clearInterval(thinkingRef.current) }
  }, [status])

  function engage() {
    if (esRef.current) esRef.current.close()
    setStatus('running')
    setStatusMessages([])
    setSuggestions([])
    setDismissed(new Set())

    const es = new EventSource('/api/agent/rules')
    esRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)
      if (event.type === 'status') {
        setStatusMessages((prev) => [...prev, event.message])
      } else if (event.type === 'suggestion') {
        const rule = event.rule
        const suggestion: AgentSuggestion = {
          conditions: rule.conditions,
          categoryName: rule.categoryName,
          categoryId: rule.categoryId,
          payeeName: rule.payeeName,
          payeeId: rule.payeeId,
          confidence: rule.confidence,
          impact: rule.impact ?? 'low',
          reasoning: rule.reasoning,
          matchCount: event.matchCount ?? 0,
          totalAmount: event.totalAmount ?? 0,
        }
        if (shouldAutoAccept(suggestion)) {
          saveRule(suggestion, categoryGroupsRef.current).then((saved) => {
            if (saved) {
              onRuleAccepted(saved)
              setSuggestions((prev) => [...prev, { ...suggestion, autoAccepted: true }])
            } else {
              // fallback: show card for manual review if save failed
              setSuggestions((prev) => [...prev, suggestion])
            }
          })
        } else {
          setSuggestions((prev) => [...prev, suggestion])
        }
      } else if (event.type === 'done') {
        setStatus('done')
        if (event.uncategorised !== undefined && event.noPayee !== undefined) {
          setDoneSummary({ uncategorised: event.uncategorised, noPayee: event.noPayee })
        }
        es.close()
      } else if (event.type === 'error') {
        setStatusMessages((prev) => [...prev, `Error: ${event.error}`])
        setStatus('error')
        es.close()
      }
    }

    es.onerror = () => {
      // EventSource fires onerror on a clean server-close too — only treat it as
      // an error if we never received a 'done' event.
      setStatus((current) => {
        if (current === 'done') return current
        setStatusMessages((prev) => [...prev, 'Connection error'])
        return 'error'
      })
      es.close()
    }
  }

  function accept(rule: UserRule, index: number) {
    onRuleAccepted(rule)
    setDismissed((d) => new Set(d).add(index))
  }

  function decline(i: number) {
    setDismissed((prev) => new Set(prev).add(i))
  }

  const autoAcceptedCount = suggestions.filter((s) => s.autoAccepted).length
  const visibleCount = suggestions.filter((s, i) => !s.autoAccepted && !dismissed.has(i)).length

  return (
    <div className="rounded-lg border bg-muted/10 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Rules Agent</h3>
        <button
          onClick={() => onClose(doneSummary)}
          className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
          aria-label="Close agent panel"
        >
          ×
        </button>
      </div>

      {/* Status log */}
      {statusMessages.length > 0 && (
        <div className="space-y-1">
          {(() => {
            // Collapse consecutive duplicate messages into one with a count badge
            const collapsed: { msg: string; count: number }[] = []
            for (const msg of statusMessages) {
              const last = collapsed[collapsed.length - 1]
              if (last && last.msg === msg) last.count++
              else collapsed.push({ msg, count: 1 })
            }
            return collapsed.map((entry, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="text-green-500">✓</span>
                {entry.msg}
                {entry.count > 1 && (
                  <span className="text-[10px] bg-black/[0.07] text-muted-foreground rounded px-1 py-0.5 tabular-nums">×{entry.count}</span>
                )}
              </p>
            ))
          })()}
          {status === 'running' && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="transition-all">{THINKING_MESSAGES[thinkingIdx]}</span>
            </p>
          )}
        </div>
      )}

      {/* Engage button */}
      {status === 'idle' && (
        <button
          onClick={engage}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Analyse transactions
        </button>
      )}

      {/* Error retry */}
      {status === 'error' && (
        <button onClick={engage} className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-muted">
          Try again
        </button>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="border-t pt-3 space-y-4">
          {(visibleCount > 0 || autoAcceptedCount > 0) && (
            <div className="flex items-center gap-3">
              {autoAcceptedCount > 0 && (
                <span className="text-[11px] bg-[#E1F5EE] text-[#0F6E56] px-2 py-0.5 rounded-full font-medium">
                  {autoAcceptedCount} auto-accepted
                </span>
              )}
              {visibleCount > 0 && (
                <p className="text-xs text-muted-foreground">{visibleCount} need{visibleCount === 1 ? 's' : ''} review</p>
              )}
            </div>
          )}

          {/* Auto-accepted compact list */}
          {suggestions.some((s) => s.autoAccepted) && (
            <div className="space-y-1">
              {suggestions.filter((s) => s.autoAccepted).map((s, i) => (
                <div key={`auto-${i}`} className="flex items-center gap-2 text-[11px] text-[#0F6E56] bg-[#E1F5EE]/60 rounded px-2.5 py-1.5">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">{s.categoryName}{s.payeeName ? ` — ${s.payeeName}` : ''}</span>
                  <span className="text-[#0F6E56]/60">·</span>
                  <span className="text-[#0F6E56]/70">{s.reasoning}</span>
                  <span className="ml-auto text-[#0F6E56]/50 tabular-nums shrink-0">~{s.matchCount} txns · ${s.totalAmount >= 1000 ? `${(s.totalAmount / 1000).toFixed(1)}k` : s.totalAmount.toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}

          {suggestions.map((s, i) =>
            s.autoAccepted || dismissed.has(i) ? null : (
              <SuggestionCard
                key={i}
                suggestion={s}
                index={i}
                total={suggestions.length}
                categoryGroups={categoryGroups}
                payees={payees}
                projects={projects}
                accounts={accounts}
                onAccepted={accept}
                onDecline={() => decline(i)}
                onApplyComplete={onApplyComplete}
              />
            )
          )}

          {status === 'done' && visibleCount === 0 && (
            <div className="text-center py-2 space-y-2">
              <p className="text-sm text-muted-foreground">All suggestions handled.</p>
              <button onClick={() => onClose(doneSummary)} className="text-xs text-[#534AB7] hover:underline">Close panel</button>
            </div>
          )}
        </div>
      )}

      {status === 'done' && suggestions.length === 0 && (
        <div className="text-center py-2 space-y-2">
          <p className="text-sm text-muted-foreground">No new rule suggestions found.</p>
          <button onClick={() => onClose(doneSummary)} className="text-xs text-[#534AB7] hover:underline">Close panel</button>
        </div>
      )}
    </div>
  )
}

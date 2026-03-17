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
  reasoning: string
  matchCount: number
}

interface RulesAgentProps {
  categoryGroups: CategoryGroup[]
  payees: Payee[]
  projects: Project[]
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

// ── SuggestionCard ─────────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  index,
  total,
  categoryGroups,
  payees,
  projects,
  onAccepted,
  onDecline,
  onApplyComplete,
}: {
  suggestion: AgentSuggestion
  index: number
  total: number
  categoryGroups: CategoryGroup[]
  payees: Payee[]
  projects: Project[]
  onAccepted: (rule: UserRule, index: number) => void
  onDecline: () => void
  onApplyComplete?: (result: { updated: number; total: number } | null) => void
}) {
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
      </div>
      <p className="text-[12px] text-[#666] text-right leading-snug">{suggestion.reasoning}</p>
    </div>
  )

  return (
    <RuleEditor
      projects={projects}
      payees={payees}
      categoryGroups={categoryGroups}
      editingRule={suggestionToRule(suggestion, categoryGroups)}
      onSave={(rule) => onAccepted(rule, index)}
      onCancel={onDecline}
      saveLabel="Accept"
      cancelLabel="Decline"
      showSaveAndApply
      onApplyComplete={onApplyComplete}
      cardHeader={header}
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

export function RulesAgent({ categoryGroups, payees, projects, onRuleAccepted, onClose, onApplyComplete }: RulesAgentProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [statusMessages, setStatusMessages] = useState<string[]>([])
  const [thinkingIdx, setThinkingIdx] = useState(0)
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [doneSummary, setDoneSummary] = useState<{ uncategorised: number; noPayee: number } | undefined>(undefined)
  const esRef = useRef<EventSource | null>(null)
  const thinkingRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        setSuggestions((prev) => [
          ...prev,
          {
            conditions: rule.conditions,
            categoryName: rule.categoryName,
            categoryId: rule.categoryId,
            payeeName: rule.payeeName,
            payeeId: rule.payeeId,
            confidence: rule.confidence,
            reasoning: rule.reasoning,
            matchCount: event.matchCount ?? 0,
          },
        ])
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
      setStatusMessages((prev) => [...prev, 'Connection error'])
      setStatus('error')
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

  const visibleCount = suggestions.filter((_, i) => !dismissed.has(i)).length

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
          {statusMessages.map((msg, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="text-green-500">✓</span>
              {msg}
            </p>
          ))}
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
          {visibleCount > 0 && (
            <p className="text-xs text-muted-foreground">{visibleCount} suggestion{visibleCount !== 1 ? 's' : ''} — edit any before accepting</p>
          )}

          {suggestions.map((s, i) =>
            dismissed.has(i) ? null : (
              <SuggestionCard
                key={i}
                suggestion={s}
                index={i}
                total={suggestions.length}
                categoryGroups={categoryGroups}
                payees={payees}
                projects={projects}
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

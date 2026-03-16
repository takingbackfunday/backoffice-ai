'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
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
  onClose: () => void
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
    merchantName: null,
    payeeId: s.payeeId,
    payee: s.payeeName ? { id: s.payeeId ?? '', name: s.payeeName } : null,
    projectId: null,
    project: null,
    conditions: s.conditions,
    isActive: true,
  }
}

// ── Condition summary (mirrors rules-manager conditionSummary) ─────────────────

const FIELD_LABELS: Record<string, string> = {
  description: 'Description', payeeName: 'Payee', merchantName: 'Merchant',
  rawDescription: 'Raw description', amount: 'Amount', currency: 'Currency',
}
const OPERATOR_LABELS: Record<string, string> = {
  contains: 'contains', equals: 'equals', starts_with: 'starts with',
  oneOf: 'is one of', gt: '>', lt: '<', gte: '≥', lte: '≤',
}

function conditionSummary(conditions: AgentSuggestion['conditions']): string {
  const defs = conditions.all ?? conditions.any ?? []
  const join = conditions.any ? ' OR ' : ' AND '
  return defs.map((c) => {
    const val = Array.isArray(c.value) ? (c.value as string[]).join(', ') : `"${c.value}"`
    return `${FIELD_LABELS[c.field] ?? c.field} ${OPERATOR_LABELS[c.operator] ?? c.operator} ${val}`
  }).join(join) || '(no conditions)'
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
  const isHighConfidence = suggestion.confidence === 'high'
  const [expanded, setExpanded] = useState(!isHighConfidence)
  const [accepting, setAccepting] = useState(false)

  const rule = useMemo(() => suggestionToRule(suggestion, categoryGroups), [suggestion, categoryGroups])

  function handleQuickAccept() {
    setAccepting(true)
    fetch(rule.id ? `/api/rules/${rule.id}` : '/api/rules', {
      method: rule.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: [conditionSummary(suggestion.conditions), rule.categoryName].filter(Boolean).join(' → '),
        priority: rule.priority,
        conditions: rule.conditions,
        categoryName: rule.categoryName,
        categoryId: rule.categoryId,
        payeeName: rule.payee?.name ?? null,
        projectId: rule.projectId ?? null,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setAccepting(false); return }
        onAccepted(json.data, index)
      })
      .catch(() => setAccepting(false))
  }

  function handleQuickAcceptAndApply() {
    setAccepting(true)
    fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: [conditionSummary(suggestion.conditions), rule.categoryName].filter(Boolean).join(' → '),
        priority: rule.priority,
        conditions: rule.conditions,
        categoryName: rule.categoryName,
        categoryId: rule.categoryId,
        payeeName: rule.payee?.name ?? null,
        projectId: rule.projectId ?? null,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setAccepting(false); return }
        onAccepted(json.data, index)
        // Fire-and-forget apply
        fetch('/api/rules/apply', { method: 'POST' })
          .then((r) => r.json().then((applyJson) => ({ ok: r.ok, applyJson })))
          .then(({ ok: applyOk, applyJson }) => {
            if (onApplyComplete) onApplyComplete(applyOk ? (applyJson.data ?? null) : null)
          })
          .catch(() => { if (onApplyComplete) onApplyComplete(null) })
      })
      .catch(() => setAccepting(false))
  }

  return (
    <div className={`rounded-lg border bg-white overflow-hidden ${expanded ? '' : 'hover:border-primary/30 transition-colors'}`}>
      {/* Collapsed row — mirrors RuleCard layout */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{conditionSummary(suggestion.conditions)}</p>
          {rule.categoryName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2 py-0.5 shrink-0">
              <span className="text-blue-400">cat</span>
              {rule.categoryName}
            </span>
          )}
          {rule.payee && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs px-2 py-0.5 shrink-0">
              <span className="text-violet-400">payee</span>
              {rule.payee.name}
            </span>
          )}
          <span className="text-xs text-muted-foreground shrink-0">~{suggestion.matchCount} txns</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isHighConfidence && !expanded && (
            <>
              <button
                onClick={handleQuickAccept}
                disabled={accepting}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:opacity-90"
              >
                {accepting ? '…' : 'Accept'}
              </button>
              <button
                onClick={handleQuickAcceptAndApply}
                disabled={accepting}
                className="rounded-md bg-primary/80 px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:opacity-90"
              >
                {accepting ? '…' : '& apply'}
              </button>
              <button
                onClick={onDecline}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                Decline
              </button>
            </>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={expanded ? 'Collapse' : 'Edit'}
            title={expanded ? 'Collapse' : 'Edit / expand'}
          >
            {expanded ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Reasoning line — always visible */}
      {suggestion.reasoning && (
        <p className="text-xs text-muted-foreground italic px-3 pb-1.5 -mt-1">{suggestion.reasoning}</p>
      )}

      {/* Expanded full editor */}
      {expanded && (
        <div className="border-t p-1">
          <RuleEditor
            projects={projects}
            payees={payees}
            categoryGroups={categoryGroups}
            editingRule={rule}
            onSave={(saved) => onAccepted(saved, index)}
            onCancel={onDecline}
            saveLabel="Accept"
            cancelLabel="Decline"
            showSaveAndApply
            onApplyComplete={onApplyComplete}
          />
        </div>
      )}
    </div>
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
          onClick={onClose}
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
            <p className="text-sm text-muted-foreground text-center py-2">All suggestions handled.</p>
          )}
        </div>
      )}

      {status === 'done' && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">No new rule suggestions found.</p>
      )}
    </div>
  )
}

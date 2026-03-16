'use client'

import { useEffect, useState } from 'react'
import type { Project } from '@prisma/client'
import { RuleEditor, type UserRule, type CategoryGroup, type Payee } from './rule-editor'
import { RulesAgent } from './rules-agent'

// ── Local helpers (only needed for RuleCard display) ──────────────────────────

const FIELD_LABELS: Record<string, string> = {
  description: 'Description', payeeName: 'Payee', merchantName: 'Merchant (legacy)',
  rawDescription: 'Raw description', amount: 'Amount', currency: 'Currency',
}

const OPERATOR_LABELS: Record<string, string> = {
  contains: 'contains', equals: 'equals', starts_with: 'starts with',
  regex: 'matches regex', gt: '>', lt: '<', gte: '≥', lte: '≤',
  in: 'is one of', oneOf: 'is one of',
}

function conditionSummary(rule: UserRule): string {
  const defs = rule.conditions.all ?? rule.conditions.any ?? []
  const join = rule.conditions.any ? ' OR ' : ' AND '
  return defs
    .map((c) => {
      const val = Array.isArray(c.value) ? c.value.join(', ') : `"${c.value}"`
      return `${FIELD_LABELS[c.field] ?? c.field} ${OPERATOR_LABELS[c.operator] ?? c.operator} ${val}`
    })
    .join(join) || '(no conditions)'
}

// ── Rule card ─────────────────────────────────────────────────────────────────

function RuleCard({
  rule, onEdit, onDelete, onToggle, deleting, toggling,
}: {
  rule: UserRule
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  deleting: boolean
  toggling: boolean
}) {
  return (
    <div className={`rounded-lg border bg-white px-3 py-2 transition-opacity ${!rule.isActive ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{conditionSummary(rule)}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2 py-0.5">
            <span className="text-blue-400">cat</span>
            {rule.categoryRef?.name ?? rule.categoryName}
          </span>
          {rule.payee && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs px-2 py-0.5">
              <span className="text-violet-400">payee</span>
              {rule.payee.name}
            </span>
          )}
          {rule.project && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-2 py-0.5">
              <span className="text-emerald-400">proj</span>
              {rule.project.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">#{rule.priority}</span>

          <button onClick={onToggle} disabled={toggling}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${rule.isActive ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            aria-label={rule.isActive ? 'Disable rule' : 'Enable rule'}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${rule.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
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

// ── Main RulesManager ─────────────────────────────────────────────────────────

export function RulesManager() {
  const [rules, setRules] = useState<UserRule[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [payees, setPayees] = useState<Payee[]>([])
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingRule, setEditingRule] = useState<UserRule | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ updated: number; total: number } | null>(null)
  const [showAgent, setShowAgent] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/rules').then((r) => r.json()),
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/category-groups').then((r) => r.json()),
      fetch('/api/payees').then((r) => r.json()),
    ]).then(([rulesJson, projectsJson, groupsJson, payeesJson]) => {
      if (!rulesJson.error) setRules(rulesJson.data ?? [])
      if (!projectsJson.error) setProjects(projectsJson.data ?? [])
      if (!groupsJson.error) setCategoryGroups(groupsJson.data ?? [])
      if (!payeesJson.error) setPayees(payeesJson.data ?? [])
    }).catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  async function toggleActive(rule: UserRule) {
    setTogglingId(rule.id)
    const res = await fetch(`/api/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    if (res.ok) setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
    setTogglingId(null)
  }

  async function deleteRule(id: string) {
    setDeletingId(id)
    const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' })
    if (res.ok) setRules((prev) => prev.filter((r) => r.id !== id))
    setDeletingId(null)
  }

  async function applyAllRules() {
    setApplying(true)
    setApplyResult(null)
    try {
      const res = await fetch('/api/rules/apply', { method: 'POST' })
      const json = await res.json()
      if (res.ok && !json.error) setApplyResult(json.data)
    } finally {
      setApplying(false)
    }
  }

  function handleEditorSave(rule: UserRule) {
    if (editingRule) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? rule : r))
    } else {
      setRules((prev) => [rule, ...prev])
    }
    setShowEditor(false)
    setEditingRule(undefined)
  }

  function openNewEditor() {
    setEditingRule(undefined)
    setShowEditor(true)
  }

  function openEditEditor(rule: UserRule) {
    setEditingRule(rule)
    setShowEditor(true)
  }

  function closeEditor() {
    setShowEditor(false)
    setEditingRule(undefined)
  }

  const filteredRules = query.trim()
    ? rules.filter((rule) => {
        const q = query.toLowerCase()
        const conditions = rule.conditions.all ?? rule.conditions.any ?? []
        const inputMatch = conditions.some((c) =>
          String(c.value).toLowerCase().includes(q) || c.field.toLowerCase().includes(q) || c.operator.toLowerCase().includes(q)
        )
        const outputMatch =
          (rule.categoryRef?.name ?? rule.categoryName ?? '').toLowerCase().includes(q) ||
          (rule.payee?.name ?? '').toLowerCase().includes(q) ||
          (rule.project?.name ?? '').toLowerCase().includes(q)
        return inputMatch || outputMatch
      })
    : rules

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base">Your rules</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rules run automatically on every import. Apply them retroactively to existing transactions below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {applyResult && (
            <span className="text-xs text-muted-foreground">
              Updated {applyResult.updated} of {applyResult.total} transactions
            </span>
          )}
          <button
            onClick={applyAllRules}
            disabled={applying || rules.filter((r) => r.isActive).length === 0}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {applying ? 'Applying…' : 'Apply all rules'}
          </button>
          <button
            onClick={() => setShowAgent((v) => !v)}
            className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors"
          >
            {showAgent ? 'Hide agent' : 'Engage rules agent'}
          </button>
          {!showEditor && (
            <button
              onClick={openNewEditor}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              data-testid="new-rule-btn"
            >
              + New rule
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      {rules.length > 0 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rules by condition, category, payee, project…"
          className="w-full rounded-md border px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}

      {/* Agent panel */}
      {showAgent && (
        <RulesAgent
          categoryGroups={categoryGroups}
          payees={payees}
          projects={projects}
          onRuleAccepted={(rule) => setRules((prev) => [rule as UserRule, ...prev])}
          onClose={() => setShowAgent(false)}
        />
      )}

      {/* Editor */}
      {showEditor && (
        <RuleEditor
          projects={projects}
          payees={payees}
          categoryGroups={categoryGroups}
          editingRule={editingRule}
          onSave={handleEditorSave}
          onCancel={closeEditor}
        />
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && rules.length === 0 && !showEditor && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
          No rules yet. Create one and it will run on every future import.
        </p>
      )}

      {/* Rule cards */}
      {rules.length > 0 && (
        <div className="space-y-2">
          {filteredRules.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No rules match "{query}"</p>
          )}
          {filteredRules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => openEditEditor(rule)}
              onDelete={() => deleteRule(rule.id)}
              onToggle={() => toggleActive(rule)}
              deleting={deletingId === rule.id}
              toggling={togglingId === rule.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

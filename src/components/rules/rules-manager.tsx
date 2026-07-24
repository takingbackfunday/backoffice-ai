'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Workspace } from '@/generated/prisma/client'
import { RuleEditor, Toast, type UserRule, type CategoryGroup, type Payee } from './rule-editor'
import { RulesAgent, type PersistedSuggestion } from './rules-agent'
import { RuleCard } from './rule-card'
import { RuleSuggestionsPanel } from './rule-suggestions-panel'
import { PaymentSuggestionsPanel, type PaymentSuggestion } from './payment-suggestions-panel'
import { StarterRules } from './starter-rules'
import { detectRuleConflicts, groupConflictsByRule } from '@/lib/rules/rule-conflicts'
import { userRuleToLike } from './rule-types'

export function RulesManager({
  initialRules, initialWorkspaces, initialPayees, initialAccounts, initialCategoryGroups,
  initialPendingSuggestions, initialPaymentSuggestions, aiSuggestionsEnabled, aiNudgeDismissed,
}: {
  initialRules?: UserRule[]; initialWorkspaces?: Workspace[]; initialPayees?: Payee[]
  initialAccounts?: { id: string; name: string }[]; initialCategoryGroups?: CategoryGroup[]
  initialPendingSuggestions?: PersistedSuggestion[]; initialPaymentSuggestions?: PaymentSuggestion[]
  aiSuggestionsEnabled?: boolean; aiNudgeDismissed?: boolean
} = {}) {
  const searchParams = useSearchParams()
  const autoAgent = searchParams.get('agent') === '1'
  const autoNew = searchParams.get('new') === '1'
  const aiEnabled = aiSuggestionsEnabled ?? false

  const [rules, setRules] = useState<UserRule[]>(initialRules ?? [])
  const [projects, setWorkspaces] = useState<Workspace[]>(initialWorkspaces ?? [])
  const [payees, setPayees] = useState<Payee[]>(initialPayees ?? [])
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>(initialAccounts ?? [])
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>(initialCategoryGroups ?? [])
  const [loading, setLoading] = useState(!initialRules)
  const [error, setError] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(autoNew)
  const [editingRule, setEditingRule] = useState<UserRule | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ updated: number; total: number } | null>(null)
  const [showAgent, setShowAgent] = useState(autoAgent && aiEnabled)
  const [showStarter, setShowStarter] = useState(false)
  const [agentFinishedSummary, setAgentFinishedSummary] = useState<{ uncategorised: number; noPayee: number } | null>(null)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingSuggestions, setPendingSuggestions] = useState<PersistedSuggestion[]>(initialPendingSuggestions ?? [])
  const [paymentSuggestions, setPaymentSuggestions] = useState<PaymentSuggestion[]>(initialPaymentSuggestions ?? [])
  const [nudgeDismissed, setNudgeDismissed] = useState(aiNudgeDismissed ?? false)

  const conflicts = useMemo(() => detectRuleConflicts(rules.map(userRuleToLike)), [rules])
  const conflictsById = useMemo(() => groupConflictsByRule(conflicts), [conflicts])

  function handlePayeeCreated(p: Payee) {
    setPayees((prev) => [...prev.filter((x) => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)))
  }

  useEffect(() => {
    if (initialRules) return
    Promise.all([
      fetch('/api/rules').then((r) => r.json()),
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/category-groups').then((r) => r.json()),
      fetch('/api/payees').then((r) => r.json()),
      fetch('/api/accounts').then((r) => r.json()),
      fetch('/api/rules/suggestions').then((r) => r.json()),
      fetch('/api/invoice-payment-suggestions').then((r) => r.json()),
    ]).then(([rulesJson, projectsJson, groupsJson, payeesJson, accountsJson, suggestionsJson, paymentSuggestionsJson]) => {
      if (!rulesJson.error) setRules(rulesJson.data ?? [])
      if (!projectsJson.error) setWorkspaces(projectsJson.data ?? [])
      if (!groupsJson.error) setCategoryGroups(groupsJson.data ?? [])
      if (!payeesJson.error) setPayees(payeesJson.data ?? [])
      if (!accountsJson.error) setAccounts(accountsJson.data ?? [])
      if (!suggestionsJson.error && !initialPendingSuggestions) setPendingSuggestions(suggestionsJson.data ?? [])
      if (!paymentSuggestionsJson.error && !initialPaymentSuggestions) setPaymentSuggestions(paymentSuggestionsJson.data ?? [])
    }).catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRules])

  useEffect(() => {
    if (agentFinishedSummary) {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = setTimeout(() => setAgentFinishedSummary(null), 8000)
    }
    return () => { if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current) }
  }, [agentFinishedSummary])

  async function toggleActive(rule: UserRule) {
    setTogglingId(rule.id)
    const res = await fetch(`/api/rules/${rule.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !rule.isActive }) })
    if (res.ok) setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
    setTogglingId(null)
  }

  async function deleteRule(id: string) {
    setDeletingId(id)
    if ((await fetch(`/api/rules/${id}`, { method: 'DELETE' })).ok) setRules((prev) => prev.filter((r) => r.id !== id))
    setDeletingId(null)
  }

  async function applyAllRules() {
    setApplying(true); setApplyResult(null)
    try {
      const res = await fetch('/api/rules/apply', { method: 'POST' })
      const json = await res.json()
      if (res.ok && !json.error) setApplyResult(json.data)
    } finally { setApplying(false) }
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  function handleApplyComplete(result: { updated: number; total: number } | null) {
    if (result) showToast(`Applied — ${result.updated} transaction${result.updated !== 1 ? 's' : ''} updated`)
    else showToast('Apply failed', 'error')
  }

  function handleEditorSave(rule: UserRule) {
    setRules((prev) => editingRule ? prev.map((r) => r.id === rule.id ? rule : r) : [rule, ...prev])
    setShowEditor(false); setEditingRule(undefined)
  }

  const openNewEditor = () => { setEditingRule(undefined); setShowEditor(true) }
  const openEditEditor = (rule: UserRule) => { setEditingRule(rule); setShowEditor(true) }
  const closeEditor = () => { setShowEditor(false); setEditingRule(undefined) }

  function handleAgentClose(summary?: { uncategorised: number; noPayee: number }) {
    setShowAgent(false)
    if (summary) setAgentFinishedSummary(summary)
  }

  async function dismissNudge() {
    setNudgeDismissed(true)
    fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiSuggestionsNudgeDismissed: true }) })
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
          (rule.workspace?.name ?? '').toLowerCase().includes(q)
        return inputMatch || outputMatch
      })
    : rules

  const allFilteredSelected = filteredRules.length > 0 && filteredRules.every((r) => selectedIds.has(r.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    setSelectedIds((s) => { const n = new Set(s); filteredRules.forEach((r) => allFilteredSelected ? n.delete(r.id) : n.add(r.id)); return n })
  }

  const toggleSelect = (id: string) => setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds)
    setBulkDeleteConfirm(false); setBulkDeleting(true); setBulkDeleteProgress({ done: 0, total: ids.length })
    let done = 0
    await Promise.allSettled(ids.map((id) =>
      fetch(`/api/rules/${id}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error('failed'); setRules((prev) => prev.filter((rule) => rule.id !== id)); done++; setBulkDeleteProgress({ done, total: ids.length }) })
    ))
    setSelectedIds(new Set()); setBulkDeleting(false); setBulkDeleteProgress({ done: 0, total: 0 })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium">Your rules</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Rules run automatically on every import. Apply them retroactively to existing transactions below.
        </p>
      </div>

      {agentFinishedSummary && (
        <div className="flex items-center gap-2 text-[12px] bg-[#E1F5EE] text-[#085041] rounded-lg px-3 py-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Rules agent finished — {agentFinishedSummary.uncategorised} uncategorised &amp; {agentFinishedSummary.noPayee} unmatched-payee analysed</span>
          <button onClick={() => setAgentFinishedSummary(null)} className="ml-1 hover:opacity-70 leading-none">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStarter((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${showStarter ? 'border-black/20 bg-muted text-foreground' : 'border-black/20 text-[#666] hover:bg-muted'}`}
          >
            {showStarter ? 'Hide starter rules' : 'Starter rules'}
          </button>
          {aiEnabled && (
            <button
              onClick={() => setShowAgent((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${showAgent ? 'border-[#534AB7]/40 bg-[#EEEDFE] text-[#3C3489] hover:bg-[#e5e3fd]' : 'border-[#534AB7]/40 text-[#534AB7] hover:bg-[#EEEDFE]'}`}
            >
              {showAgent ? 'Hide agent' : 'Run rules agent'}
            </button>
          )}
        </div>
        {!showEditor && (
          <button
            onClick={openNewEditor}
            className="rounded-md bg-[#3C3489] px-4 py-1.5 text-sm font-medium text-[#EEEDFE] hover:bg-[#2d2770] transition-colors whitespace-nowrap"
            data-testid="new-rule-btn"
          >
            + New rule
          </button>
        )}
      </div>

      {showAgent && (
        <RulesAgent
          categoryGroups={categoryGroups}
          payees={payees}
          projects={projects}
          accounts={accounts}
          onRuleAccepted={(rule) => setRules((prev) => [rule as UserRule, ...prev])}
          onClose={handleAgentClose}
          onApplyComplete={handleApplyComplete}
          onPayeeCreated={handlePayeeCreated}
        />
      )}

      {showStarter && (
        <div className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4">
          <StarterRules
            onInstalled={(count) => {
              setShowStarter(false)
              showToast(`${count} starter rule${count !== 1 ? 's' : ''} installed`)
              fetch('/api/rules').then((r) => r.json()).then((json) => {
                if (!json.error) setRules(json.data ?? [])
              })
            }}
          />
        </div>
      )}

      {showEditor && (
        <RuleEditor
          projects={projects}
          payees={payees}
          accounts={accounts}
          categoryGroups={categoryGroups}
          editingRule={editingRule}
          onSave={handleEditorSave}
          onCancel={closeEditor}
          onApplyComplete={handleApplyComplete}
          allRules={rules}
          onPayeeCreated={handlePayeeCreated}
        />
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!aiEnabled && !nudgeDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-black/20 px-4 py-3">
          <span className="text-[13px]">💡</span>
          <div className="flex-1 text-[13px] text-muted-foreground">
            AI rule suggestions are off.{' '}
            <Link href="/settings#ai-features" className="text-[#534AB7] underline hover:no-underline">
              Turn them on in Settings
            </Link>{' '}
            to get automatic rule ideas from your edits and imports.
          </div>
          <button type="button" onClick={dismissNudge} className="text-muted-foreground hover:text-foreground leading-none shrink-0" aria-label="Dismiss">✕</button>
        </div>
      )}

      {aiEnabled && (
        <RuleSuggestionsPanel
          suggestions={pendingSuggestions}
          categoryGroups={categoryGroups}
          payees={payees}
          projects={projects}
          accounts={accounts}
          onAccepted={(rule) => setRules((prev) => [rule, ...prev])}
          onIgnoreAll={() => setPendingSuggestions([])}
          onApplyComplete={handleApplyComplete}
          onPayeeCreated={handlePayeeCreated}
          showToast={showToast}
        />
      )}

      <PaymentSuggestionsPanel
        suggestions={paymentSuggestions}
        onReviewed={(id) => setPaymentSuggestions((prev) => prev.filter((s) => s.id !== id))}
        showToast={showToast}
      />

      {!loading && rules.length === 0 && !showEditor && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
          No rules yet. Create one and it will run on every future import.
        </p>
      )}

      {rules.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
              </svg>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search rules…"
                className="w-full pl-8 pr-3 py-1.5 text-[13px] border border-black/15 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30" />
            </div>
            <button
              onClick={applyAllRules}
              disabled={applying || rules.filter((r) => r.isActive).length === 0}
              className="rounded-md border border-black/20 px-3 py-1.5 text-sm text-[#666] hover:bg-muted disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {applying ? 'Applying…' : 'Apply all rules'}
            </button>
            {applyResult && (
              <span className="text-xs text-muted-foreground">
                {applyResult.updated} of {applyResult.total} updated
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 px-1 text-xs">
            <input type="checkbox" checked={allFilteredSelected} ref={(el) => { if (el) el.indeterminate = someSelected && !allFilteredSelected }}
              onChange={toggleAll} className="cursor-pointer" aria-label="Select all rules" />
            {(someSelected || bulkDeleting) ? (
              bulkDeleting ? (
                <>
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                  <span className="text-muted-foreground">Deleting {bulkDeleteProgress.done} of {bulkDeleteProgress.total}…</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">{selectedIds.size} selected</span>
                  {bulkDeleteConfirm ? (
                    <>
                      <span className="text-red-600 font-medium">Delete {selectedIds.size} rules?</span>
                      <button onClick={confirmBulkDelete} className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700">Confirm</button>
                      <button onClick={() => setBulkDeleteConfirm(false)} className="rounded border px-2 py-1 hover:bg-muted">Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setBulkDeleteConfirm(true)} className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700">Delete selected</button>
                  )}
                  <button onClick={() => { setSelectedIds(new Set()); setBulkDeleteConfirm(false) }} className="text-muted-foreground hover:text-foreground px-1">✕</button>
                </>
              )
            ) : (
              <span className="text-[12px] text-muted-foreground">{filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {filteredRules.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No rules match &quot;{query}&quot;</p>
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
              selected={selectedIds.has(rule.id)}
              onSelect={() => toggleSelect(rule.id)}
              conflicts={conflictsById.get(rule.id)}
            />
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  )
}

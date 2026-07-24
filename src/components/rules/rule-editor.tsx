'use client'

import { useMemo, useRef, useState } from 'react'
import type { Workspace } from '@/generated/prisma/client'
import { detectRuleConflicts, type UserRuleLike } from '@/lib/rules/rule-conflicts'
import { ConditionRow } from './condition-row'
import { OutputRow } from './output-row'
import { LivePreview } from './live-preview'
import { RuleConflictBanner } from './rule-conflict-banner'
import {
  AMOUNT_FIELDS, OUTPUT_TYPE_LABELS, defaultCondition, userRuleToLike,
  type CategoryGroup, type ConditionDef, type ConditionOp, type OutputAction,
  type OutputActionType, type Payee, type UserRule,
} from './rule-types'

// Re-export the shared types/constants so existing importers of './rule-editor'
// keep working (cells, tables, manager, agent, modals).
export * from './rule-types'

// ── Toast ──────────────────────────────────────────────────────────────────────

export function Toast({ message, type = 'success' }: { message: string; type?: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg shadow-lg px-4 py-2.5 text-sm font-medium animate-in slide-in-from-bottom-4 fade-in duration-200 ${
      type === 'success' ? 'bg-zinc-900 text-white' : 'bg-red-600 text-white'
    }`}>
      {type === 'success' ? (
        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {message}
    </div>
  )
}

// ── RuleEditor ─────────────────────────────────────────────────────────────────

export interface RuleEditorFormData {
  conditions: object
  categoryId: string | null
  categoryName: string
  payeeId: string | null
  payeeName: string | null
}

export function RuleEditor({
  projects, payees, accounts, categoryGroups, editingRule, onSave, onCancel, saveLabel, cancelLabel, showSaveAndApply, onApplyComplete,
  cardHeader, onSaveOverride, allRules, onPayeeCreated,
}: {
  projects: Workspace[]
  payees: Payee[]
  accounts?: { id: string; name: string }[]
  categoryGroups: CategoryGroup[]
  editingRule?: UserRule
  onSave: (rule: UserRule) => void
  onCancel: () => void
  saveLabel?: string
  cancelLabel?: string
  showSaveAndApply?: boolean
  onApplyComplete?: (result: { updated: number; total: number } | null) => void
  cardHeader?: React.ReactNode
  /** If provided, replaces the API save — called with current form state so the caller can persist with user edits */
  onSaveOverride?: (shouldApply: boolean, formData: RuleEditorFormData) => Promise<void>
  /** Existing rules — enables the live conflict warning banner. */
  allRules?: UserRule[]
  /** Called when the user explicitly creates a payee inside the editor. */
  onPayeeCreated?: (p: Payee) => void
}) {
  const initialConditions = (): ConditionDef[] => {
    if (!editingRule) return [defaultCondition()]
    const defs = editingRule.conditions.all ?? editingRule.conditions.any ?? []
    return defs.map((c) => ({
      field: c.field as ConditionDef['field'],
      operator: c.operator as ConditionDef['operator'],
      value: Array.isArray(c.value) ? (c.value as string[]).join(', ') : String(c.value),
    }))
  }

  const initialOutputs = (): OutputAction[] => {
    const base: OutputAction[] = [{
      type: 'category',
      value: editingRule?.categoryId ?? editingRule?.categoryName ?? '',
    }]
    if (editingRule?.payee) {
      // Payee outputs carry the payee *id*; `label` keeps an unmatched
      // (e.g. agent-suggested) name visible for the explicit-create flow.
      const hasId = !!editingRule.payee.id && payees.some((p) => p.id === editingRule.payee!.id)
      base.push({ type: 'payee', value: hasId ? editingRule.payee.id : '', label: hasId ? undefined : editingRule.payee.name })
    }
    const workspaceId = editingRule?.workspaceId ?? editingRule?.projectId
    if (workspaceId) base.push({ type: 'project', value: workspaceId })
    if (editingRule?.setNotes) base.push({ type: 'notes', value: editingRule.setNotes })
    return base
  }

  const [conditions, setConditions] = useState<ConditionDef[]>(initialConditions)
  const [op, setOp] = useState<ConditionOp>(editingRule?.conditions.any ? 'or' : 'and')
  const [outputs, setOutputs] = useState<OutputAction[]>(initialOutputs)
  const [priority, setPriority] = useState(editingRule?.priority ?? 50)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOutputOpen, setAddOutputOpen] = useState(false)
  const applyAfterSaveRef = useRef(false)

  const usedTypes = new Set(outputs.map((o) => o.type))
  const availableToAdd = (['category', 'payee', 'project', 'notes'] as OutputActionType[])
    .filter((t) => !usedTypes.has(t))

  function updateCondition(i: number, c: ConditionDef) {
    setConditions((prev) => prev.map((x, idx) => (idx === i ? c : x)))
  }

  function updateOutput(i: number, a: OutputAction) {
    setOutputs((prev) => prev.map((x, idx) => (idx === i ? a : x)))
  }

  // Resolve the current payee output to id + display name.
  function resolvePayee(): { payeeId: string | null; payeeName: string | null } {
    const payeeOutput = outputs.find((o) => o.type === 'payee')
    if (!payeeOutput) return { payeeId: null, payeeName: null }
    if (payeeOutput.value) {
      return { payeeId: payeeOutput.value, payeeName: payees.find((p) => p.id === payeeOutput.value)?.name ?? null }
    }
    const label = payeeOutput.label?.trim()
    return { payeeId: null, payeeName: label || null }
  }

  // Live conflict detection: run the candidate rule against the user's other rules.
  const liveConflicts = useMemo(() => {
    if (!allRules) return []
    const validDefs = conditions.filter((c) => c.value.trim() !== '')
    if (validDefs.length === 0) return []
    const defs = validDefs.map((c) => ({
      field: c.field,
      operator: c.operator,
      value: c.operator === 'oneOf' || c.operator === 'includes' || c.operator === 'excludes'
        ? c.value.split(',').map((s) => s.trim()).filter(Boolean)
        : AMOUNT_FIELDS.has(c.field) ? Number(c.value) : c.value,
    }))
    const categoryOutput = outputs.find((o) => o.type === 'category')?.value.trim() ?? ''
    const allCats = categoryGroups.flatMap((g) => g.categories)
    const matchedCat = allCats.find((c) => c.id === categoryOutput)
    const { payeeId } = resolvePayee()
    const candidate: UserRuleLike = {
      id: editingRule?.id ?? '(new)',
      name: '(this rule)',
      priority,
      isActive: true,
      conditions: op === 'or' ? { any: defs } : { all: defs },
      categoryId: matchedCat?.id ?? null,
      categoryName: matchedCat?.name ?? categoryOutput ?? null,
      payeeId,
      workspaceId: outputs.find((o) => o.type === 'project')?.value || null,
      setNotes: outputs.find((o) => o.type === 'notes')?.value.trim() || null,
    }
    const others = allRules.filter((r) => r.id !== editingRule?.id).map(userRuleToLike)
    return detectRuleConflicts([...others, candidate]).filter((c) => c.ruleId === candidate.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditions, op, outputs, priority, allRules, categoryGroups, editingRule?.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validDefs = conditions.filter((c) => c.value.trim() !== '')
    const categoryOutput = outputs.find((o) => o.type === 'category')?.value.trim() ?? ''
    const payeeOutput = outputs.find((o) => o.type === 'payee')
    const payeeHasValue = !!(payeeOutput?.value || payeeOutput?.label?.trim())
    if (validDefs.length === 0) { setError('Add at least one condition.'); return }
    if (!categoryOutput && !payeeHasValue && !outputs.find((o) => o.type === 'project')?.value.trim()) {
      setError('Add at least one output action.'); return
    }

    setSaving(true)
    setError(null)

    const { payeeId, payeeName } = resolvePayee()
    const workspaceId = outputs.find((o) => o.type === 'project')?.value || null
    const setNotes  = outputs.find((o) => o.type === 'notes')?.value.trim() || null

    const allCats = categoryGroups.flatMap((g) => g.categories)
    const matchedCat = allCats.find((c) => c.id === categoryOutput)
    const categoryId = matchedCat?.id ?? null
    const categoryName = matchedCat?.name ?? categoryOutput

    const defs = validDefs.map((c) => ({
      field: c.field,
      operator: c.operator,
      value: c.operator === 'oneOf' || c.operator === 'includes' || c.operator === 'excludes'
        ? c.value.split(',').map((s) => s.trim()).filter(Boolean)
        : AMOUNT_FIELDS.has(c.field) ? Number(c.value) : c.value,
    }))

    const conditionsGroup = op === 'or' ? { any: defs } : { all: defs }
    const firstName = validDefs[0]
    const label = firstName.operator === 'oneOf' ? firstName.value.split(',')[0].trim() : firstName.value

    try {
      const isEdit = !!editingRule?.id
      const shouldApply = isEdit || applyAfterSaveRef.current

      if (onSaveOverride) {
        await onSaveOverride(shouldApply, { conditions: conditionsGroup, categoryId, categoryName, payeeId, payeeName })
        return
      }

      const url = isEdit ? `/api/rules/${editingRule!.id}` : '/api/rules'
      const method = isEdit ? 'PATCH' : 'POST'

      const ruleName = categoryName
        ? `${label} → ${categoryName}`
        : payeeName
          ? `${label} → ${payeeName}`
          : label

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ruleName, priority, conditions: conditionsGroup, categoryName, categoryId, payeeId, payeeName, workspaceId, setNotes }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to save rule'); return }
      onSave(json.data)
      if (shouldApply) {
        fetch('/api/rules/apply', { method: 'POST' })
          .then((r) => r.json().then((applyJson) => ({ ok: r.ok, applyJson })))
          .then(({ ok: applyOk, applyJson }) => {
            if (onApplyComplete) onApplyComplete(applyOk ? (applyJson.data ?? null) : null)
          })
          .catch(() => { if (onApplyComplete) onApplyComplete(null) })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSaving(false)
      applyAfterSaveRef.current = false
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-black/[0.1] bg-white overflow-hidden" data-testid="rule-editor">
      {/* Optional card header (e.g. suggestion metadata) */}
      {cardHeader}

      {/* When → Then */}
      <div className="flex gap-2 px-3 py-2 items-start">
        {/* WHEN */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#0C447C] mb-1">When</p>
          <div className="space-y-1">
            {conditions.map((cond, i) => (
              <ConditionRow key={i} cond={cond} index={i} op={op} isOnly={conditions.length === 1}
                onChange={(c) => updateCondition(i, c)}
                onRemove={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                onToggleOp={() => setOp((prev) => prev === 'and' ? 'or' : 'and')}
                accounts={accounts} />
            ))}
          </div>
          <button type="button" onClick={() => setConditions((prev) => [...prev, defaultCondition()])}
            className="text-[11px] text-[#999] hover:text-[#555] mt-1 block">
            + add condition
          </button>
        </div>

        {/* Arrow */}
        <div className="flex items-center pt-[22px] shrink-0">
          <svg width="16" height="12" viewBox="0 0 20 14" fill="none">
            <path d="M12 1L18 7M18 7L12 13M18 7H2" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* THEN */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#666] mb-1">Then</p>
          <div className="space-y-1">
            {outputs.map((action, i) => (
              <OutputRow key={action.type} action={action} projects={projects} payees={payees}
                categoryGroups={categoryGroups} onChange={(a) => updateOutput(i, a)}
                onRemove={() => setOutputs((prev) => prev.filter((_, idx) => idx !== i))}
                canRemove={outputs.length > 1}
                onPayeeCreated={onPayeeCreated} />
            ))}
          </div>
          {availableToAdd.length > 0 && (
            <div className="relative inline-block mt-1">
              <button type="button" onClick={() => setAddOutputOpen((v) => !v)}
                className="text-[11px] text-[#999] hover:text-[#555]">
                + add output
              </button>
              {addOutputOpen && (
                <div className="absolute left-0 top-5 z-10 rounded-lg border border-black/10 bg-white shadow-md min-w-[160px]">
                  {availableToAdd.map((t) => (
                    <button key={t} type="button"
                      onClick={() => { setOutputs((prev) => [...prev, { type: t, value: '' }]); setAddOutputOpen(false) }}
                      className="block w-full text-left px-3 py-1 text-[12px] hover:bg-muted">
                      {OUTPUT_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live preview */}
      <div className="px-3 pb-2">
        <LivePreview conditions={conditions} op={op} outputs={outputs} categoryGroups={categoryGroups} projects={projects} payees={payees} />
      </div>

      <RuleConflictBanner conflicts={liveConflicts} />

      {error && <p className="text-xs text-red-600 px-3 pb-1.5" role="alert">{error}</p>}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-black/[0.07]">
        <div className="flex items-center gap-1.5">
          {(!editingRule || showSaveAndApply) && (
            <button type="submit" disabled={saving}
              onClick={() => { applyAfterSaveRef.current = true }}
              className="rounded bg-[#085041] text-[#E1F5EE] px-3 py-1 text-[12px] font-medium disabled:opacity-50 hover:opacity-90">
              {saving ? 'Saving…' : (saveLabel ? `${saveLabel} & apply` : (editingRule?.id ? 'Update & apply' : 'Save & apply'))}
            </button>
          )}
          <button type="submit" disabled={saving}
            onClick={() => { applyAfterSaveRef.current = false }}
            className="rounded border border-black/20 text-[#555] px-3 py-1 text-[12px] disabled:opacity-50 hover:bg-muted">
            {saving ? 'Saving…' : (saveLabel ?? (editingRule?.id ? 'Update & apply' : 'Save rule'))}
          </button>
          <button type="button" onClick={onCancel}
            className="text-[#999] px-2 py-1 text-[12px] hover:text-[#555]">
            {cancelLabel ?? 'Cancel'}
          </button>
        </div>
        <label className="flex items-center gap-1 text-[10px] text-[#999]">
          Priority
          <input type="number" min={1} max={99} value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-9 text-center text-[11px] text-[#333] rounded border border-black/15 px-1 py-0.5" />
        </label>
      </div>
    </form>
  )
}

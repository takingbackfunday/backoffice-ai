'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { Project } from '@prisma/client'

// ── Types ──────────────────────────────────────────────────────────────────────

export type ConditionOp = 'and' | 'or'
export type ConditionField = 'payeeName' | 'description' | 'amount' | 'currency'
export type ConditionOperator = 'contains' | 'equals' | 'starts_with' | 'oneOf' | 'gt' | 'lt' | 'gte' | 'lte'

export interface ConditionDef {
  field: ConditionField
  operator: ConditionOperator
  value: string
}

export type OutputActionType = 'category' | 'payee' | 'project'
export interface OutputAction { type: OutputActionType; value: string }

export interface CategoryGroup {
  id: string
  name: string
  categories: { id: string; name: string }[]
}

export interface Payee { id: string; name: string }

export interface UserRule {
  id: string
  name: string
  priority: number
  categoryName: string
  categoryId: string | null
  categoryRef: { id: string; name: string; group: { id: string; name: string } } | null
  merchantName: string | null
  payeeId: string | null
  payee: { id: string; name: string } | null
  projectId: string | null
  project: { id: string; name: string } | null
  conditions: {
    all?: { field: string; operator: string; value: string | number | string[] }[]
    any?: { field: string; operator: string; value: string | number | string[] }[]
  }
  isActive: boolean
}

interface PreviewTx {
  id: string
  date: string
  description: string
  merchantName: string | null  // kept as fallback for payee display
  amount: number
  currency: string
  category: string | null
  payeeName: string | null
  projectName: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const FIELD_OPTIONS: { value: ConditionField; label: string }[] = [
  { value: 'payeeName', label: 'Payee' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
  { value: 'currency', label: 'Currency' },
]

export const OPERATOR_OPTIONS: { value: ConditionOperator; label: string; forAmount?: boolean }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'oneOf', label: 'is one of' },
  { value: 'gt', label: '>', forAmount: true },
  { value: 'lt', label: '<', forAmount: true },
  { value: 'gte', label: '≥', forAmount: true },
  { value: 'lte', label: '≤', forAmount: true },
]

export const OUTPUT_TYPE_LABELS: Record<OutputActionType, string> = {
  category: 'Set category',
  payee: 'Assign payee',
  project: 'Tag to project',
}

export function defaultCondition(): ConditionDef {
  return { field: 'payeeName', operator: 'contains', value: '' }
}

// ── LivePreview ────────────────────────────────────────────────────────────────

function DeltaCell({ current, next }: { current: string | null; next: string | null }) {
  if (next === null) return <td className="px-2 py-1 text-muted-foreground">{current ?? '—'}</td>
  if (next === current) return <td className="px-2 py-1 text-muted-foreground">{current ?? '—'}</td>
  return (
    <td className="px-2 py-1">
      <span className="line-through text-muted-foreground/60">{current ?? '—'}</span>
      {' '}
      <span className="text-emerald-600 font-medium">{next}</span>
    </td>
  )
}

function LivePreview({ conditions, op, outputs, categoryGroups, projects }: { conditions: ConditionDef[]; op: ConditionOp; outputs: OutputAction[]; categoryGroups: CategoryGroup[]; projects: Project[] }) {
  const [results, setResults] = useState<PreviewTx[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runPreview = useCallback(async () => {
    const validDefs = conditions.filter((c) => c.value.trim() !== '')
    if (validDefs.length === 0) { setResults([]); return }

    setLoading(true)
    try {
      const defs = validDefs.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.operator === 'oneOf'
          ? c.value.split(',').map((s) => s.trim()).filter(Boolean)
          : c.field === 'amount' ? Number(c.value) : c.value,
      }))

      const res = await fetch('/api/rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions: { op, defs } }),
      })
      const json = await res.json()
      setResults(json.data ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [conditions, op])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(runPreview, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [runPreview])

  // Derive what the rule would set (null = output not configured = no change)
  const rawCategory = outputs.find((o) => o.type === 'category')?.value.trim() || null
  const allCats = categoryGroups.flatMap((g) => g.categories)
  const newCategory = rawCategory ? (allCats.find((c) => c.id === rawCategory)?.name ?? rawCategory) : null
  const newPayee = outputs.find((o) => o.type === 'payee')?.value.trim() || null
  // project output stores an id, not a name — we can't resolve to a name here without a lookup,
  // so we just flag it as "will be set" if present
  const newProjectId = outputs.find((o) => o.type === 'project')?.value || null
  const newProjectName = newProjectId ? (projects.find((p) => p.id === newProjectId)?.name ?? null) : null

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {loading ? 'Checking…' : `Live preview — ${results.length} matching transaction${results.length !== 1 ? 's' : ''} (from last 500)`}
      </p>
      {results.length > 0 && (
        <div className="overflow-auto max-h-52 rounded border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left font-medium whitespace-nowrap">Date</th>
                <th className="px-2 py-1 text-left font-medium">Description</th>
                <th className="px-2 py-1 text-right font-medium whitespace-nowrap">Amount</th>
                <th className="px-2 py-1 text-left font-medium">Currency</th>
                <th className="px-2 py-1 text-left font-medium">Category</th>
                <th className="px-2 py-1 text-left font-medium">Payee</th>
                <th className="px-2 py-1 text-left font-medium">Project</th>
              </tr>
            </thead>
            <tbody>
              {results.map((tx) => (
                <tr key={tx.id} className="border-t">
                  <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{new Date(tx.date).toLocaleDateString()}</td>
                  <td className="px-2 py-1 max-w-[160px]"><span className="block truncate">{tx.description}</span></td>
                  <td className={`px-2 py-1 text-right font-mono whitespace-nowrap ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{tx.currency}</td>
                  <DeltaCell current={tx.category} next={newCategory} />
                  <DeltaCell current={tx.payeeName ?? tx.merchantName} next={newPayee} />
                  <DeltaCell current={tx.projectName} next={newProjectName} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── ConditionRow ───────────────────────────────────────────────────────────────

export function ConditionRow({
  cond, index, op, isOnly, onChange, onRemove, onToggleOp,
}: {
  cond: ConditionDef; index: number; op: ConditionOp; isOnly: boolean
  onChange: (c: ConditionDef) => void; onRemove: () => void; onToggleOp?: () => void
}) {
  const isAmount = cond.field === 'amount'
  const availableOps = OPERATOR_OPTIONS.filter((o) =>
    isAmount ? (o.forAmount || o.value === 'equals') : !o.forAmount
  )

  function handleFieldChange(field: ConditionField) {
    const newIsAmount = field === 'amount'
    const validOps = OPERATOR_OPTIONS.filter((o) => newIsAmount ? (o.forAmount || o.value === 'equals') : !o.forAmount)
    const op = validOps.find((o) => o.value === cond.operator) ? cond.operator : validOps[0].value
    onChange({ ...cond, field, operator: op })
  }

  return (
    <div className="flex items-center gap-2">
      {index > 0 && (
        <button type="button" onClick={onToggleOp}
          className="text-xs font-semibold text-primary w-7 text-center uppercase shrink-0 rounded hover:bg-muted px-1 py-0.5 transition-colors"
          title="Click to toggle AND / OR">
          {op}
        </button>
      )}
      {index === 0 && <span className="w-7 shrink-0" />}

      <select value={cond.field} onChange={(e) => handleFieldChange(e.target.value as ConditionField)}
        className="rounded border px-2 py-1 text-sm" aria-label="Condition field">
        {FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select value={cond.operator} onChange={(e) => onChange({ ...cond, operator: e.target.value as ConditionOperator })}
        className="rounded border px-2 py-1 text-sm" aria-label="Condition operator">
        {availableOps.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <div className="flex-1 min-w-0">
        <input
          type={isAmount ? 'number' : 'text'}
          value={cond.value}
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
          placeholder={cond.operator === 'oneOf' ? 'Uber, Lyft, Bolt  (comma-separated)' : isAmount ? '0' : 'value…'}
          className="w-full rounded border px-2 py-1 text-sm"
          aria-label="Condition value"
        />
        {cond.operator === 'oneOf' && (
          <p className="text-xs text-muted-foreground mt-0.5">Separate multiple values with commas</p>
        )}
      </div>

      <button type="button" onClick={onRemove} disabled={isOnly}
        className="text-muted-foreground hover:text-red-600 disabled:opacity-30 text-lg leading-none px-1"
        aria-label="Remove condition" title="Remove condition">×</button>
    </div>
  )
}

// ── OutputRow ──────────────────────────────────────────────────────────────────

export function OutputRow({
  action, projects, payees, categoryGroups, onChange, onRemove, canRemove,
}: {
  action: OutputAction; projects: Project[]; payees: Payee[]; categoryGroups: CategoryGroup[]
  onChange: (a: OutputAction) => void; onRemove: () => void; canRemove: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground w-40 shrink-0">
        {OUTPUT_TYPE_LABELS[action.type]}
      </span>
      {action.type === 'project' ? (
        <select value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
          className="flex-1 rounded border px-2 py-1 text-sm" aria-label="Project">
          <option value="">— None —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : action.type === 'payee' ? (
        <>
          <input
            type="text"
            list="payee-suggestions"
            value={action.value}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            placeholder="e.g. Amazon"
            className="flex-1 rounded border px-2 py-1 text-sm"
            aria-label="Payee name"
          />
          <datalist id="payee-suggestions">
            {payees.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
        </>
      ) : action.type === 'category' && categoryGroups.length > 0 ? (
        <select value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
          className="flex-1 rounded border px-2 py-1 text-sm" aria-label="Category" required>
          <option value="">— Select category —</option>
          {categoryGroups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {g.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      ) : (
        <input type="text" value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
          placeholder="e.g. Rent & Utilities" className="flex-1 rounded border px-2 py-1 text-sm"
          aria-label={OUTPUT_TYPE_LABELS[action.type]} required={action.type === 'category'} />
      )}
      <button type="button" onClick={onRemove} disabled={!canRemove}
        className="text-muted-foreground hover:text-red-600 disabled:opacity-30 text-lg leading-none px-1"
        aria-label={`Remove ${OUTPUT_TYPE_LABELS[action.type]}`}>×</button>
    </div>
  )
}

// ── RuleEditor ─────────────────────────────────────────────────────────────────

export function RuleEditor({
  projects, payees, categoryGroups, editingRule, onSave, onCancel, saveLabel, cancelLabel, showSaveAndApply,
}: {
  projects: Project[]
  payees: Payee[]
  categoryGroups: CategoryGroup[]
  editingRule?: UserRule
  onSave: (rule: UserRule) => void
  onCancel: () => void
  saveLabel?: string
  cancelLabel?: string
  showSaveAndApply?: boolean
}) {
  const initialConditions = (): ConditionDef[] => {
    if (!editingRule) return [defaultCondition()]
    const defs = editingRule.conditions.all ?? editingRule.conditions.any ?? []
    return defs.map((c) => ({
      field: c.field as ConditionField,
      operator: c.operator as ConditionOperator,
      value: Array.isArray(c.value) ? (c.value as string[]).join(', ') : String(c.value),
    }))
  }

  const initialOutputs = (): OutputAction[] => {
    const base: OutputAction[] = [{
      type: 'category',
      value: editingRule?.categoryId ?? editingRule?.categoryName ?? '',
    }]
    if (editingRule?.payee) base.push({ type: 'payee', value: editingRule.payee.name })
    if (editingRule?.projectId) base.push({ type: 'project', value: editingRule.projectId })
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
  const availableToAdd = (['payee', 'project'] as OutputActionType[]).filter((t) => !usedTypes.has(t))

  function updateCondition(i: number, c: ConditionDef) {
    setConditions((prev) => prev.map((x, idx) => (idx === i ? c : x)))
  }

  function updateOutput(i: number, a: OutputAction) {
    setOutputs((prev) => prev.map((x, idx) => (idx === i ? a : x)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validDefs = conditions.filter((c) => c.value.trim() !== '')
    const categoryOutput = outputs.find((o) => o.type === 'category')?.value.trim() ?? ''
    if (validDefs.length === 0 || !categoryOutput) return

    setSaving(true)
    setError(null)

    const payeeName = outputs.find((o) => o.type === 'payee')?.value.trim() || null
    const projectId = outputs.find((o) => o.type === 'project')?.value || null

    const allCats = categoryGroups.flatMap((g) => g.categories)
    const matchedCat = allCats.find((c) => c.id === categoryOutput)
    const categoryId = matchedCat?.id ?? null
    const categoryName = matchedCat?.name ?? categoryOutput

    const defs = validDefs.map((c) => ({
      field: c.field,
      operator: c.operator,
      value: c.operator === 'oneOf'
        ? c.value.split(',').map((s) => s.trim()).filter(Boolean)
        : c.field === 'amount' ? Number(c.value) : c.value,
    }))

    const conditionsGroup = op === 'or' ? { any: defs } : { all: defs }
    const firstName = validDefs[0]
    const label = firstName.operator === 'oneOf' ? firstName.value.split(',')[0].trim() : firstName.value

    try {
      const isEdit = !!editingRule?.id
      const url = isEdit ? `/api/rules/${editingRule!.id}` : '/api/rules'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${label} → ${categoryName}`,
          priority,
          conditions: conditionsGroup,
          categoryName,
          categoryId,
          payeeName,
          projectId,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to save rule'); return }
      if (applyAfterSaveRef.current) {
        await fetch('/api/rules/apply', { method: 'POST' })
      }
      onSave(json.data)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
      applyAfterSaveRef.current = false
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-muted/20 p-4 space-y-4" data-testid="rule-editor">
      {/* Conditions */}
      <div className="space-y-2">
        {conditions.map((cond, i) => (
          <ConditionRow key={i} cond={cond} index={i} op={op} isOnly={conditions.length === 1}
            onChange={(c) => updateCondition(i, c)}
            onRemove={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
            onToggleOp={() => setOp((prev) => prev === 'and' ? 'or' : 'and')} />
        ))}
        <button type="button" onClick={() => setConditions((prev) => [...prev, defaultCondition()])}
          className="text-xs text-primary hover:underline ml-7">+ Add condition</button>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-1 border-t">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</p>
        {outputs.map((action, i) => (
          <OutputRow key={action.type} action={action} projects={projects} payees={payees}
            categoryGroups={categoryGroups} onChange={(a) => updateOutput(i, a)}
            onRemove={() => setOutputs((prev) => prev.filter((_, idx) => idx !== i))}
            canRemove={outputs.length > 1 || action.type !== 'category'} />
        ))}
        {availableToAdd.length > 0 && (
          <div className="relative inline-block">
            <button type="button" onClick={() => setAddOutputOpen((v) => !v)}
              className="text-xs text-primary hover:underline">+ Add output</button>
            {addOutputOpen && (
              <div className="absolute left-0 top-5 z-10 rounded-md border bg-white shadow-md min-w-[180px]">
                {availableToAdd.map((t) => (
                  <button key={t} type="button"
                    onClick={() => { setOutputs((prev) => [...prev, { type: t, value: '' }]); setAddOutputOpen(false) }}
                    className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted">
                    {OUTPUT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <LivePreview conditions={conditions} op={op} outputs={outputs} categoryGroups={categoryGroups} projects={projects} />

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

      <div className="flex items-center gap-2 flex-1">
        <button type="submit" disabled={saving}
          onClick={() => { applyAfterSaveRef.current = false }}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving && !applyAfterSaveRef.current ? 'Saving…' : (saveLabel ?? (editingRule ? 'Update rule' : 'Save rule'))}
        </button>
        {(!editingRule || showSaveAndApply) && (
          <button type="submit" disabled={saving}
            onClick={() => { applyAfterSaveRef.current = true }}
            className="rounded-md bg-primary/90 px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {saving && applyAfterSaveRef.current ? 'Saving & applying…' : (saveLabel ? `${saveLabel} & apply` : 'Save & apply')}
          </button>
        )}
        <button type="button" onClick={onCancel} className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted">
          {cancelLabel ?? 'Cancel'}
        </button>
        <label className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
          Priority
          <input type="number" min={1} max={99} value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-14 rounded border px-2 py-1 text-sm text-foreground" />
        </label>
      </div>
    </form>
  )
}

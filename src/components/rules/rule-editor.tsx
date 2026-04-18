'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { Workspace } from '@/generated/prisma/client'

// ── Types ──────────────────────────────────────────────────────────────────────

export type ConditionOp = 'and' | 'or'
export type ConditionField =
  | 'payeeName' | 'description' | 'amount' | 'currency'
  | 'accountName' | 'notes' | 'date' | 'month' | 'dayOfWeek'
export type ConditionOperator =
  | 'contains' | 'not_contains' | 'equals' | 'not_equals'
  | 'starts_with' | 'ends_with' | 'regex' | 'oneOf' | 'includes' | 'excludes'
  | 'gt' | 'lt' | 'gte' | 'lte'

export interface ConditionDef {
  field: ConditionField
  operator: ConditionOperator
  value: string
}

export type OutputActionType = 'category' | 'payee' | 'project' | 'notes'
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
  payeeId: string | null
  payee: { id: string; name: string } | null
  projectId: string | null
  workspace: { id: string; name: string } | null
  conditions: {
    all?: { field: string; operator: string; value: string | number | string[] }[]
    any?: { field: string; operator: string; value: string | number | string[] }[]
  }
  isActive: boolean
  updatedAt?: string | Date
}

interface PreviewTx {
  id: string
  date: string
  description: string
  amount: number
  currency: string
  category: string | null
  payeeName: string | null
  projectName: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

// Which fields are numeric (use numeric operators)
const AMOUNT_FIELDS = new Set<ConditionField>(['amount'])
// Which fields use date-style operators
const DATE_FIELDS = new Set<ConditionField>(['date', 'month', 'dayOfWeek'])

export const FIELD_OPTIONS: { value: ConditionField; label: string; group: string }[] = [
  // Transaction data
  { value: 'description',  label: 'Description',   group: 'Transaction' },
  { value: 'amount',       label: 'Amount',         group: 'Transaction' },
  { value: 'currency',     label: 'Currency',       group: 'Transaction' },
  { value: 'notes',        label: 'Notes',          group: 'Transaction' },
  // Linked records
  { value: 'payeeName',    label: 'Payee name',     group: 'Linked' },
  { value: 'accountName',  label: 'Account name',   group: 'Linked' },
  // Date
  { value: 'date',         label: 'Date (YYYY-MM-DD)', group: 'Date' },
  { value: 'month',        label: 'Month (YYYY-MM)',   group: 'Date' },
  { value: 'dayOfWeek',    label: 'Day of week',       group: 'Date' },
]

export const OPERATOR_OPTIONS: { value: ConditionOperator; label: string; forAmount?: boolean; forArray?: boolean; forText?: boolean }[] = [
  // Text operators
  { value: 'contains',     label: 'contains',        forText: true },
  { value: 'not_contains', label: 'does not contain', forText: true },
  { value: 'equals',       label: 'equals' },
  { value: 'not_equals',   label: 'does not equal' },
  { value: 'starts_with',  label: 'starts with',     forText: true },
  { value: 'ends_with',    label: 'ends with',       forText: true },
  { value: 'oneOf',        label: 'is one of',       forText: true },
  { value: 'regex',        label: 'matches regex',   forText: true },
  // Numeric operators
  { value: 'gt',           label: '>',               forAmount: true },
  { value: 'lt',           label: '<',               forAmount: true },
  { value: 'gte',          label: '≥',               forAmount: true },
  { value: 'lte',          label: '≤',               forAmount: true },
]

export const OUTPUT_TYPE_LABELS: Record<OutputActionType, string> = {
  category: 'Set category',
  payee:    'Assign payee',
  project:  'Assign project',
  notes:    'Set notes',
}

export function defaultCondition(): ConditionDef {
  return { field: 'description', operator: 'contains', value: '' }
}

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

// ── LivePreview ────────────────────────────────────────────────────────────────

function DeltaCell({ current, next }: { current: string | null; next: string | null }) {
  if (next === null) return <td className="px-1.5 py-1 text-[#888]">{current ?? '—'}</td>
  if (next === current) return <td className="px-1.5 py-1 text-[#888]">{current ?? '—'}</td>
  return (
    <td className="px-1.5 py-1">
      <span className="line-through text-[#bbb]">{current ?? '—'}</span>
      {' '}
      <span className="text-emerald-700 font-medium">{next}</span>
    </td>
  )
}

function LivePreview({ conditions, op, outputs, categoryGroups, projects }: {
  conditions: ConditionDef[]
  op: ConditionOp
  outputs: OutputAction[]
  categoryGroups: CategoryGroup[]
  projects: Workspace[]
}) {
  const [results, setResults] = useState<PreviewTx[]>([])
  const [matchCount, setMatchCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDefsRef = useRef<string>('')

  const buildDefs = useCallback((conds: ConditionDef[]) =>
    conds.filter((c) => c.value.trim() !== '').map((c) => ({
      field: c.field,
      operator: c.operator,
      value: c.operator === 'oneOf'
        ? c.value.split(',').map((s) => s.trim()).filter(Boolean)
        : c.field === 'amount' ? Number(c.value) : c.value,
    })), [])

  const runPreview = useCallback(async () => {
    const defs = buildDefs(conditions)
    console.log('[LivePreview] runPreview defs:', defs)
    if (defs.length === 0) { setResults([]); setMatchCount(0); return }
    setLoading(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const payload = { conditions: { op, defs } }
      console.log('[LivePreview] POST /api/rules/preview', JSON.stringify(payload))
      const res = await fetch('/api/rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      console.log('[LivePreview] response status:', res.status)
      const json = await res.json()
      console.log('[LivePreview] response body:', json)
      setResults(json.data ?? [])
      setMatchCount(json.meta?.matchCount ?? json.data?.length ?? 0)
      setShowAll(false)
      lastDefsRef.current = JSON.stringify({ op, defs })
    } catch (err) {
      console.error('[LivePreview] fetch error:', err)
      setResults([])
      setMatchCount(0)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }, [conditions, op, buildDefs])

  async function loadAll() {
    setLoadingAll(true)
    try {
      const defs = buildDefs(conditions)
      const res = await fetch('/api/rules/preview?all=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions: { op, defs } }),
      })
      const json = await res.json()
      setResults(json.data ?? [])
      setShowAll(true)
    } catch {
      setShowAll(true) // fall back to showing what we have
    } finally {
      setLoadingAll(false)
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(runPreview, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [runPreview])

  const rawCategory = outputs.find((o) => o.type === 'category')?.value.trim() || null
  const allCats = categoryGroups.flatMap((g) => g.categories)
  const newCategory = rawCategory ? (allCats.find((c) => c.id === rawCategory)?.name ?? rawCategory) : null
  const newPayee = outputs.find((o) => o.type === 'payee')?.value.trim() || null
  const newWorkspaceId = outputs.find((o) => o.type === 'project')?.value || null
  const newWorkspaceName = newWorkspaceId ? (projects.find((p) => p.id === newWorkspaceId)?.name ?? null) : null

  const PREVIEW_ROWS = 2
  const visible = results.slice(0, showAll ? undefined : PREVIEW_ROWS)
  const hiddenCount = matchCount - visible.length

  return (
    <div className="mx-0 rounded bg-[#f7f7f6] px-2.5 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#999] mb-1">
        {loading ? 'Checking…' : (
          <>Live preview <span className="font-normal normal-case tracking-normal">· {matchCount} matching</span></>
        )}
      </p>
      {results.length > 0 && (
        <>
          <div className="rounded overflow-hidden border border-black/[0.06]">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="px-1.5 py-1 text-left font-medium text-[#999] whitespace-nowrap">Date</th>
                  <th className="px-1.5 py-1 text-left font-medium text-[#999]">Description</th>
                  <th className="px-1.5 py-1 text-right font-medium text-[#999] whitespace-nowrap">Amount</th>
                  <th className="px-1.5 py-1 text-left font-medium text-[#999]">Ccy</th>
                  <th className="px-1.5 py-1 text-left font-medium text-[#999]">Category</th>
                  <th className="px-1.5 py-1 text-left font-medium text-[#999]">Payee</th>
                  <th className="px-1.5 py-1 text-left font-medium text-[#999]">Workspace</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {visible.map((tx, i) => (
                  <tr key={tx.id} className={i > 0 ? 'border-t border-black/[0.06]' : ''}>
                    <td className="px-1.5 py-1 text-[#888] whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</td>
                    <td className="px-1.5 py-1 text-[#333] max-w-[140px]"><span className="block truncate">{tx.description}</span></td>
                    <td className={`px-1.5 py-1 text-right font-mono whitespace-nowrap font-medium ${tx.amount >= 0 ? 'text-emerald-700' : 'text-[#a32d2d]'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                    </td>
                    <td className="px-1.5 py-1 text-[#888]">{tx.currency}</td>
                    <DeltaCell current={tx.category} next={newCategory} />
                    <DeltaCell current={tx.payeeName} next={newPayee} />
                    <DeltaCell current={tx.projectName} next={newWorkspaceName} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hiddenCount > 0 && !showAll && (
            <button
              type="button"
              onClick={loadAll}
              disabled={loadingAll}
              className="w-full text-center text-[11px] text-[#999] hover:text-[#666] pt-1.5 disabled:opacity-50"
            >
              {loadingAll ? 'Loading…' : `+ ${hiddenCount} more`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── ConditionPill ──────────────────────────────────────────────────────────────

export function ConditionRow({
  cond, index, op, isOnly, onChange, onRemove, onToggleOp, accounts,
}: {
  cond: ConditionDef; index: number; op: ConditionOp; isOnly: boolean
  onChange: (c: ConditionDef) => void; onRemove: () => void; onToggleOp?: () => void
  accounts?: { id: string; name: string }[]
}) {
  const isAmount  = AMOUNT_FIELDS.has(cond.field)
  const isDate    = DATE_FIELDS.has(cond.field)

  const availableOps = OPERATOR_OPTIONS.filter((o) => {
    if (isAmount) return o.forAmount || o.value === 'equals' || o.value === 'not_equals'
    if (isDate)   return !o.forAmount
    return !o.forAmount
  })

  function handleFieldChange(field: ConditionField) {
    const newIsAmount = AMOUNT_FIELDS.has(field)
    const newIsDate   = DATE_FIELDS.has(field)
    const validOps = OPERATOR_OPTIONS.filter((o) => {
      if (newIsAmount) return o.forAmount || o.value === 'equals' || o.value === 'not_equals'
      if (newIsDate)   return !o.forAmount
      return !o.forAmount
    })
    const newOp = validOps.find((o) => o.value === cond.operator) ? cond.operator : validOps[0].value
    onChange({ ...cond, field, operator: newOp })
  }

  // Group field options for the select
  const fieldGroups = ['Transaction', 'Linked', 'Date']

  const inputPlaceholder =
    cond.operator === 'oneOf' || cond.operator === 'includes' || cond.operator === 'excludes'
      ? 'val1, val2…'
      : isAmount ? '0'
      : isDate && cond.field === 'dayOfWeek' ? 'monday'
      : isDate && cond.field === 'month' ? 'YYYY-MM'
      : isDate ? 'YYYY-MM-DD'
      : 'value…'

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {index > 0 && (
        <button type="button" onClick={onToggleOp}
          className="text-[10px] font-semibold text-[#0C447C] uppercase tracking-wide px-1 py-0.5 rounded hover:bg-[#d0e6f8] transition-colors shrink-0"
          title="Click to toggle AND / OR">
          {op}
        </button>
      )}
      <div className="flex items-center gap-1.5 bg-[#E6F1FB] rounded px-2 py-1 flex-wrap flex-1 min-w-0">
        <select
          value={cond.field}
          onChange={(e) => handleFieldChange(e.target.value as ConditionField)}
          className="bg-transparent text-[13px] font-medium text-[#185FA5] border-none outline-none cursor-pointer"
          aria-label="Condition field"
        >
          {fieldGroups.map((group) => (
            <optgroup key={group} label={group}>
              {FIELD_OPTIONS.filter((o) => o.group === group).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={cond.operator}
          onChange={(e) => onChange({ ...cond, operator: e.target.value as ConditionOperator })}
          className="bg-transparent text-[12px] text-[#0C447C]/60 border-none outline-none cursor-pointer"
          aria-label="Condition operator"
        >
          {availableOps.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {cond.field === 'accountName' && accounts && accounts.length > 0 ? (
          <select
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            className="bg-white/55 text-[13px] font-medium text-[#0C447C] rounded px-2 py-0.5 border-none outline-none min-w-[120px] w-full cursor-pointer"
            aria-label="Account name"
          >
            <option value="">— select account —</option>
            {accounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        ) : (
          <input
            type={isAmount ? 'number' : 'text'}
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            placeholder={inputPlaceholder}
            className="bg-white/55 text-[13px] font-medium text-[#0C447C] rounded px-2 py-0.5 border-none outline-none min-w-[120px] w-full"
            aria-label="Condition value"
          />
        )}
      </div>
      {!isOnly && (
        <button type="button" onClick={onRemove}
          className="text-[#bbb] hover:text-red-500 text-base leading-none px-1 shrink-0"
          aria-label="Remove condition">×</button>
      )}
    </div>
  )
}

// ── OutputPill ─────────────────────────────────────────────────────────────────

const OUTPUT_STYLES: Record<OutputActionType, { bg: string; label: string; text: string; value: string }> = {
  category: { bg: 'bg-[#EEEDFE]', label: 'text-[#534AB7]/80', text: 'text-[#3C3489]', value: 'font-medium' },
  payee:    { bg: 'bg-[#E1F5EE]', label: 'text-[#0F6E56]/80', text: 'text-[#085041]', value: 'font-medium' },
  project:  { bg: 'bg-[#FEF3E2]', label: 'text-[#92540A]/80', text: 'text-[#6B3A08]', value: 'font-medium' },
  notes:    { bg: 'bg-[#F0F0F0]', label: 'text-[#555]/80',    text: 'text-[#333]',    value: 'font-medium' },
}

const OUTPUT_LABELS: Record<OutputActionType, string> = {
  category: 'Category',
  payee:    'Payee',
  project:  'Workspace',
  notes:    'Notes',
}

export function OutputRow({
  action, projects, payees, categoryGroups, onChange, onRemove, canRemove,
}: {
  action: OutputAction; projects: Workspace[]; payees: Payee[]; categoryGroups: CategoryGroup[]
  onChange: (a: OutputAction) => void; onRemove: () => void; canRemove: boolean
}) {
  const s = OUTPUT_STYLES[action.type]

  return (
    <div className={`flex items-center gap-1.5 ${s.bg} rounded px-2 py-1`}>
      <span className={`text-[10px] ${s.label} shrink-0 w-12`}>{OUTPUT_LABELS[action.type]}</span>
      {action.type === 'project' ? (
        <select value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
          className={`bg-transparent text-[13px] ${s.text} ${s.value} border-none outline-none cursor-pointer flex-1`}
          aria-label="Workspace">
          <option value="">— None —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : action.type === 'payee' ? (
        <>
          <input type="text" list="payee-suggestions" value={action.value}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            placeholder="e.g. Amazon"
            className={`bg-transparent text-[13px] ${s.text} ${s.value} border-none outline-none flex-1 min-w-0`}
            aria-label="Payee name" />
          <datalist id="payee-suggestions">
            {payees.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
        </>
      ) : action.type === 'notes' ? (
        <input type="text" value={action.value}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
          placeholder="Note to set on matching transactions…"
          className={`bg-transparent text-[13px] ${s.text} ${s.value} border-none outline-none flex-1 min-w-0`}
          aria-label="Notes value" />
      ) : categoryGroups.length > 0 ? (
        <select value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
          className={`bg-transparent text-[13px] ${s.text} ${s.value} border-none outline-none cursor-pointer flex-1`}
          aria-label="Category">
          <option value="">— Select category —</option>
          {categoryGroups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {g.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      ) : (
        <input type="text" value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
          placeholder="e.g. Rent & Utilities"
          className={`bg-transparent text-[13px] ${s.text} ${s.value} border-none outline-none flex-1 min-w-0`}
          aria-label={OUTPUT_TYPE_LABELS[action.type]} />
      )}
      {canRemove && (
        <button type="button" onClick={onRemove}
          className="text-[#bbb] hover:text-red-500 text-base leading-none px-0.5 shrink-0"
          aria-label={`Remove ${OUTPUT_LABELS[action.type]}`}>×</button>
      )}
    </div>
  )
}

// ── RuleEditor ─────────────────────────────────────────────────────────────────

export function RuleEditor({
  projects, payees, accounts, categoryGroups, editingRule, onSave, onCancel, saveLabel, cancelLabel, showSaveAndApply, onApplyComplete,
  cardHeader, onSaveOverride,
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
  onSaveOverride?: (shouldApply: boolean, formData: { conditions: object; categoryId: string | null; categoryName: string; payeeId: string | null; payeeName: string | null }) => Promise<void>
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
    console.log('[RuleEditor] initialOutputs from editingRule:', {
      categoryId: editingRule?.categoryId,
      categoryName: editingRule?.categoryName,
      payee: editingRule?.payee,
      projectId: editingRule?.projectId,
    })
    const base: OutputAction[] = [{
      type: 'category',
      value: editingRule?.categoryId ?? editingRule?.categoryName ?? '',
    }]
    if (editingRule?.payee) base.push({ type: 'payee', value: editingRule.payee.name })
    if (editingRule?.projectId) base.push({ type: 'project', value: editingRule.projectId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = editingRule as any
    if (meta?.setNotes) base.push({ type: 'notes', value: meta.setNotes })
    console.log('[RuleEditor] initialOutputs result:', base)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validDefs = conditions.filter((c) => c.value.trim() !== '')
    const categoryOutput = outputs.find((o) => o.type === 'category')?.value.trim() ?? ''
    if (validDefs.length === 0) { setError('Add at least one condition.'); return }
    if (!categoryOutput && !outputs.find((o) => o.type === 'payee')?.value.trim() && !outputs.find((o) => o.type === 'project')?.value.trim()) {
      setError('Add at least one output action.'); return
    }

    setSaving(true)
    setError(null)

    const payeeName = outputs.find((o) => o.type === 'payee')?.value.trim() || null
    const projectId = outputs.find((o) => o.type === 'project')?.value || null
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
        await onSaveOverride(shouldApply, { conditions: conditionsGroup, categoryId, categoryName, payeeId: null, payeeName })
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
        body: JSON.stringify({ name: ruleName, priority, conditions: conditionsGroup, categoryName, categoryId, payeeName, projectId, setNotes }),
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
    } catch {
      setError('Network error')
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
                canRemove={outputs.length > 1} />
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
        <LivePreview conditions={conditions} op={op} outputs={outputs} categoryGroups={categoryGroups} projects={projects} />
      </div>

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

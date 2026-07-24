'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { Workspace } from '@/generated/prisma/client'
import type { CategoryGroup, ConditionDef, ConditionOp, OutputAction, Payee } from './rule-types'

interface PreviewTx {
  id: string
  date: string
  description: string
  amount: number
  currency: string
  accountName: string | null
  category: string | null
  payeeName: string | null
  projectName: string | null
}

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

export function LivePreview({ conditions, op, outputs, categoryGroups, projects, payees }: {
  conditions: ConditionDef[]
  op: ConditionOp
  outputs: OutputAction[]
  categoryGroups: CategoryGroup[]
  projects: Workspace[]
  payees: Payee[]
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
    if (defs.length === 0) { setResults([]); setMatchCount(0); return }
    setLoading(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch('/api/rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions: { op, defs } }),
        signal: controller.signal,
      })
      const json = await res.json()
      setResults(json.data ?? [])
      setMatchCount(json.meta?.matchCount ?? json.data?.length ?? 0)
      setShowAll(false)
      lastDefsRef.current = JSON.stringify({ op, defs })
    } catch {
      setResults([])
      setMatchCount(0)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }, [conditions, op, buildDefs])

  async function loadAll() {
    setLoadingAll(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const defs = buildDefs(conditions)
      const res = await fetch('/api/rules/preview?all=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions: { op, defs } }),
        signal: controller.signal,
      })
      const json = await res.json()
      setResults(json.data ?? [])
      setShowAll(true)
    } catch {
      setShowAll(true) // fall back to showing what we have
    } finally {
      clearTimeout(timeoutId)
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
  const payeeOutput = outputs.find((o) => o.type === 'payee')
  const newPayee = payeeOutput
    ? (payees.find((p) => p.id === payeeOutput.value)?.name ?? payeeOutput.label?.trim() ?? null)
    : null
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
                  <th className="px-1.5 py-1 text-left font-medium text-[#999]">Account</th>
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
                    <td className="px-1.5 py-1 text-[#888] whitespace-nowrap max-w-[100px]"><span className="block truncate">{tx.accountName ?? '—'}</span></td>
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

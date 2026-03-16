'use client'

import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import { useUploadStore } from '@/stores/upload-store'
import type { CsvMapping } from '@/lib/csv-processor'
import type { PreviewRow } from '@/types'

type ColValidation = { col: string | null; confidence: number; reason: string }
type ValValidation = { value: string; confidence: number; reason: string }
type MappingValidation = Record<'dateCol' | 'amountCol' | 'descCol' | 'notesCol', ColValidation> & {
  dateFormat?: ValValidation
  amountSign?: ValValidation
}

function ConfidenceBadge({ value }: { value: ColValidation | ValValidation }) {
  const color = value.confidence >= 80 ? 'text-green-600' : value.confidence >= 50 ? 'text-amber-600' : 'text-red-600'
  const icon  = value.confidence >= 80 ? '✓' : value.confidence >= 50 ? '~' : '✗'
  return (
    <p className={`text-xs mt-0.5 ${color}`} title={value.reason}>
      {icon} {value.confidence}% confident
    </p>
  )
}

const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']

// ── Deterministic header auto-mapper ─────────────────────────────────────────
function guessMapping(headers: string[]): Partial<CsvMapping> {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-().]/g, '')
  const find = (patterns: RegExp[]) =>
    headers.find((h) => patterns.some((p) => p.test(norm(h)))) ?? undefined

  const dateCol = find([
    /^date$/, /^txndate/, /^transdate/, /^transaction.*date/, /^posted.*date/,
    /^valuedate/, /^settlementdate/, /date/,
  ])

  const amountCol = find([
    /^amount$/, /^txnamount/, /^transactionamount/, /^debitcredit$/,
    /^credit$/, /^debit$/, /^amt$/, /amount/,
  ])

  const descCol = find([
    /^description$/, /^narrative$/, /^details$/, /^particulars$/,
    /^paymentdetails/, /^transactiondetails/, /^txndescription/,
    /desc/, /narr/, /detail/,
  ])

  const notesCol = find([
    /^notes$/, /^note$/, /^memo$/, /^remarks$/, /^comment/, /^reference$/,
    /notes/, /memo/,
  ])

  const dateFormat = (() => {
    const h = (dateCol ?? '').toLowerCase()
    if (h.includes('iso') || h.includes('yyyy')) return 'YYYY-MM-DD'
    return 'MM/DD/YYYY'
  })()

  return {
    ...(dateCol ? { dateCol } : {}),
    ...(amountCol ? { amountCol } : {}),
    ...(descCol ? { descCol } : {}),
    ...(notesCol ? { notesCol } : {}),
    dateFormat,
    amountSign: 'normal',
  }
}

// ── Column select field ────────────────────────────────────────────────────────
function ColSelect({
  id,
  label,
  value,
  headers,
  onChange,
  validation,
  onApplySuggestion,
}: {
  id: string
  label: string
  value: string | undefined
  headers: string[]
  onChange: (v: string | undefined) => void
  validation?: ColValidation
  onApplySuggestion?: () => void
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium mb-1">{label}</label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full rounded-md border px-3 py-1.5 text-sm"
        data-testid={id}
      >
        <option value="">— select —</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      {validation && (
        <>
          <ConfidenceBadge value={validation} />
          {validation.col !== null && validation.col !== value && (
            <p className="text-xs text-amber-700 mt-0.5">
              AI suggests:{' '}
              <button className="underline" onClick={onApplySuggestion}>
                {validation.col}
              </button>
            </p>
          )}
        </>
      )}
    </div>
  )
}

export function ColumnMapper() {
  const { csvHeaders, accountId, filename, csvText, setStep } = useUploadStore()
  const reset = useUploadStore((s) => s.reset)

  const [mapping, setMapping] = useState<Partial<CsvMapping>>(() => guessMapping([]))
  const [validation, setValidation] = useState<MappingValidation | null>(null)
  const [validating, setValidating] = useState(false)

  // Apply auto-mapping once headers are available
  useEffect(() => {
    if (csvHeaders.length > 0) setMapping(guessMapping(csvHeaders))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvHeaders.join(',')])

  // Fire LLM validation once when headers + csvText first become available
  useEffect(() => {
    if (!csvHeaders.length || !csvText) return
    const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
    const first20 = parsed.data.slice(0, 20)
    setValidating(true)
    fetch('/api/llm/validate-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers: csvHeaders, sampleRows: first20, mapping }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j.error) {
          setValidation(j.data)
          // Auto-apply all high-confidence suggestions
          setMapping((m) => {
            const next = { ...m }
            for (const field of ['dateCol', 'amountCol', 'descCol', 'notesCol'] as const) {
              const v = j.data?.[field]
              if (v?.confidence >= 80 && v.col) next[field] = v.col
            }
            if (j.data?.dateFormat?.confidence >= 80 && j.data.dateFormat.value) next.dateFormat = j.data.dateFormat.value
            if (j.data?.amountSign?.confidence >= 80 && j.data.amountSign.value) next.amountSign = j.data.amountSign.value
            return next
          })
        }
      })
      .catch(() => {})
      .finally(() => setValidating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvHeaders.join(','), csvText])

  // Live preview state
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Import state
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isValid = !!(mapping.dateCol && mapping.amountCol && mapping.descCol)

  const set = (field: keyof CsvMapping) => (v: string | undefined) =>
    setMapping((m) => ({ ...m, [field]: v }))

  const applyAI = (field: 'dateCol' | 'amountCol' | 'descCol' | 'notesCol') => {
    const col = (validation?.[field] as ColValidation | undefined)?.col
    if (col) setMapping((m) => ({ ...m, [field]: col }))
  }

  const newRows = previewRows.filter((r) => !r.isDuplicate)

  // Auto-preview whenever mapping is complete, debounced 400ms
  useEffect(() => {
    if (!isValid || !accountId || !csvText) {
      setPreviewRows([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true)
      setPreviewError(null)
      setParseErrors([])
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, csvText, mapping }),
        })
        const json = await res.json()
        if (!res.ok || json.error) {
          setPreviewError(json.error ?? 'Failed to preview. Check your column mapping.')
          setPreviewRows([])
          return
        }
        setPreviewRows(json.data ?? [])
        setTotalRows(json.meta?.totalRows ?? 0)
        setSkippedCount(json.meta?.skippedCount ?? 0)
        setDuplicateCount(json.meta?.duplicateCount ?? 0)
        setParseErrors(json.meta?.errors ?? [])
      } catch {
        setPreviewError('Network error while loading preview.')
      } finally {
        setPreviewLoading(false)
      }
    }, 400)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [mapping, isValid, accountId, csvText])

  const handleImport = async () => {
    if (!accountId || !filename || newRows.length === 0) return
    setImporting(true)
    setImportError(null)
    try {
      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          filename,
          rows: newRows.map((r) => ({
            ...r,
            category: r.suggestedCategory ?? null,
            categoryId: r.suggestedCategoryId ?? null,
            payeeId: r.payeeId ?? null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setImportError(json.error ?? 'Import failed. Please try again.')
        return
      }
      setStep('done')
    } catch {
      setImportError('Network error. Please check your connection and try again.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex gap-6 h-full min-h-0" data-testid="column-mapper-form">
      {/* Left: mapping controls — fixed width, scrollable */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
        <div>
          <p className="text-xs font-semibold text-foreground">Map columns</p>
          <p className="text-xs text-muted-foreground mt-0.5 break-all">{filename}</p>
        </div>

        {validating && <p className="text-xs text-muted-foreground">Checking with AI…</p>}

        {/* Date column + Date format together */}
        <ColSelect
          id="select-dateCol"
          label="Date column *"
          value={mapping.dateCol}
          headers={csvHeaders}
          onChange={set('dateCol')}
          validation={validation?.dateCol}
          onApplySuggestion={() => applyAI('dateCol')}
        />
        <div>
          <label htmlFor="select-dateFormat" className="block text-xs font-medium mb-1">Date format *</label>
          <select
            id="select-dateFormat"
            value={mapping.dateFormat ?? 'MM/DD/YYYY'}
            onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value }))}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            data-testid="select-dateFormat"
          >
            {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {validation?.dateFormat && (
            <>
              <ConfidenceBadge value={validation.dateFormat} />
              {validation.dateFormat.value && validation.dateFormat.value !== mapping.dateFormat && (
                <p className="text-xs text-amber-700 mt-0.5">
                  AI suggests:{' '}
                  <button className="underline" onClick={() => setMapping((m) => ({ ...m, dateFormat: validation!.dateFormat!.value }))}>
                    {validation.dateFormat.value}
                  </button>
                </p>
              )}
            </>
          )}
        </div>

        {/* Amount column + Amount sign together */}
        <ColSelect
          id="select-amountCol"
          label="Amount column *"
          value={mapping.amountCol}
          headers={csvHeaders}
          onChange={set('amountCol')}
          validation={validation?.amountCol}
          onApplySuggestion={() => applyAI('amountCol')}
        />
        <div>
          <label htmlFor="select-amountSign" className="block text-xs font-medium mb-1">Amount sign *</label>
          <select
            id="select-amountSign"
            value={mapping.amountSign ?? 'normal'}
            onChange={(e) => setMapping((m) => ({ ...m, amountSign: e.target.value as 'normal' | 'inverted' }))}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            data-testid="select-amountSign"
          >
            <option value="normal">Expenses are negative</option>
            <option value="inverted">Expenses are positive</option>
          </select>
          {validation?.amountSign && (
            <>
              <ConfidenceBadge value={validation.amountSign} />
              {validation.amountSign.value && validation.amountSign.value !== mapping.amountSign && (
                <p className="text-xs text-amber-700 mt-0.5">
                  AI suggests:{' '}
                  <button className="underline" onClick={() => setMapping((m) => ({ ...m, amountSign: validation!.amountSign!.value as 'normal' | 'inverted' }))}>
                    {validation.amountSign.value === 'normal' ? 'Expenses are negative' : 'Expenses are positive'}
                  </button>
                </p>
              )}
            </>
          )}
        </div>

        <ColSelect
          id="select-descCol"
          label="Description column *"
          value={mapping.descCol}
          headers={csvHeaders}
          onChange={set('descCol')}
          validation={validation?.descCol}
          onApplySuggestion={() => applyAI('descCol')}
        />

        <ColSelect
          id="select-notesCol"
          label="Notes (optional)"
          value={mapping.notesCol}
          headers={csvHeaders}
          onChange={set('notesCol')}
          validation={validation?.notesCol}
          onApplySuggestion={() => applyAI('notesCol')}
        />

        {/* Import button */}
        <div className="pt-2 space-y-2">
          <button
            onClick={handleImport}
            disabled={importing || newRows.length === 0 || previewLoading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            data-testid="confirm-import-btn"
            aria-label={`Import ${newRows.length} new transactions`}
          >
            {importing ? 'Importing…' : `Import ${newRows.length} transaction${newRows.length !== 1 ? 's' : ''}`}
          </button>
          <button
            onClick={reset}
            className="w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            data-testid="cancel-import-btn"
          >
            Cancel
          </button>
          {importError && (
            <p className="text-xs text-red-600" role="alert">{importError}</p>
          )}
        </div>
      </div>

      {/* Right: live preview */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-xs min-h-5">
            {previewLoading && <span className="text-muted-foreground">Updating preview…</span>}
            {!previewLoading && isValid && (
              <>
                <span><strong>{totalRows}</strong> rows total</span>
                <span className="text-green-600"><strong>{newRows.length}</strong> new</span>
                {duplicateCount > 0 && (
                  <span className="text-muted-foreground"><strong>{duplicateCount}</strong> duplicates</span>
                )}
                {skippedCount > 0 && (
                  <span className="text-amber-600"><strong>{skippedCount}</strong> could not be parsed</span>
                )}
              </>
            )}
            {!previewLoading && !isValid && (
              <span className="text-muted-foreground">Select date, amount, and description columns to preview.</span>
            )}
            {previewError && <span className="text-red-600">{previewError}</span>}
          </div>

          {parseErrors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1" role="alert">
              {parseErrors.map((err, i) => (
                <p key={i} className="text-xs text-amber-800">{err}</p>
              ))}
              {skippedCount === totalRows && (
                <p className="text-xs font-medium text-amber-900 mt-1">
                  Try changing your column selections — all rows are failing to parse.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="overflow-auto rounded-lg border flex-1">
          <table className="w-full text-xs" aria-label="Transaction preview" data-testid="preview-table">
            <thead className="bg-muted sticky top-0 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Notes</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Payee</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 && !previewLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {isValid ? 'No rows found.' : 'Preview will appear here.'}
                  </td>
                </tr>
              ) : (
                previewRows.slice(0, 100).map((row, i) => (
                  <tr
                    key={`${i}-${row.duplicateHash}`}
                    className={`border-t ${row.isDuplicate ? 'opacity-40' : ''}`}
                    data-testid={`preview-row-${row.isDuplicate ? 'duplicate' : 'new'}`}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {new Date(row.date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-1.5 max-w-[180px]">
                      <span className="block truncate">{row.description}</span>
                    </td>
                    <td className="px-3 py-1.5 max-w-[120px] text-muted-foreground">
                      <span className="block truncate">{row.notes ?? '—'}</span>
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono ${row.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {row.payeeId
                        ? <span className="text-green-700">✓ matched</span>
                        : <span>—</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {row.suggestedCategory ? (
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            row.suggestionConfidence === 'high'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                          title={row.suggestionConfidence === 'medium' ? 'Review suggested' : undefined}
                        >
                          {row.suggestedCategory}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {row.isDuplicate
                        ? <span className="text-muted-foreground">duplicate</span>
                        : <span className="text-green-600">new</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

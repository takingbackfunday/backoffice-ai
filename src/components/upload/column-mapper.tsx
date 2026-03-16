'use client'

import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import { useUploadStore } from '@/stores/upload-store'
import type { CsvMapping } from '@/lib/csv-processor'
import type { PreviewRow } from '@/types'

type FieldValidation = { col: string | null; confidence: number; reason: string }
type MappingValidation = Record<'dateCol' | 'amountCol' | 'descCol' | 'payeeCol' | 'notesCol', FieldValidation>

function ConfidenceBadge({ value }: { value: FieldValidation }) {
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
// Tries to guess column assignments from header names alone.
// An LLM-based fallback will replace/augment this in a future iteration.
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
    /^description$/, /^memo$/, /^narrative$/, /^details$/, /^particulars$/,
    /^reference$/, /^paymentdetails/, /^transactiondetails/, /^txndescription/,
    /desc/, /narr/, /detail/, /memo/,
  ])

  const payeeCol = find([
    /^payee$/, /^merchant$/, /^merchantname/, /^vendor$/, /^counterparty$/,
    /^originator$/, /payee/, /merchant/, /vendor/,
  ])

  const notesCol = find([
    /^notes$/, /^note$/, /^memo$/, /^remarks$/, /^comment/, /^reference$/,
    /notes/, /memo/,
  ])

  // Detect date format from header name heuristics
  // (actual format detection from data would be more accurate, but headers are all we have here)
  const dateFormat = (() => {
    const h = (dateCol ?? '').toLowerCase()
    if (h.includes('iso') || h.includes('yyyy')) return 'YYYY-MM-DD'
    return 'MM/DD/YYYY' // safe US default
  })()

  return {
    ...(dateCol ? { dateCol } : {}),
    ...(amountCol ? { amountCol } : {}),
    ...(descCol ? { descCol } : {}),
    ...(payeeCol ? { payeeCol } : {}),
    ...(notesCol ? { notesCol } : {}),
    dateFormat,
    amountSign: 'normal',
  }
}

export function ColumnMapper() {
  const { csvHeaders, accountId, filename, csvText, setStep } = useUploadStore()
  const reset = useUploadStore((s) => s.reset)

  const [mapping, setMapping] = useState<Partial<CsvMapping>>(() =>
    guessMapping([])
  )

  const [validation, setValidation] = useState<MappingValidation | null>(null)
  const [validating, setValidating] = useState(false)

  // Apply auto-mapping once headers are available
  useEffect(() => {
    if (csvHeaders.length > 0) {
      setMapping(guessMapping(csvHeaders))
    }
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
      .then((j) => { if (!j.error) setValidation(j.data) })
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

  const applyLLMSuggestion = (field: 'dateCol' | 'amountCol' | 'descCol' | 'payeeCol' | 'notesCol') => {
    const col = validation?.[field]?.col
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
    <div className="flex gap-8 h-full" data-testid="column-mapper-form">
      {/* Left: mapping controls */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          Map columns from <strong>{filename}</strong>
        </p>

        {validating && <p className="text-xs text-muted-foreground">Checking mapping with AI…</p>}

        {(['dateCol', 'amountCol', 'descCol', 'payeeCol', 'notesCol'] as const).map((field) => (
          <div key={field}>
            <label htmlFor={`select-${field}`} className="block text-xs font-medium mb-1">
              {field === 'dateCol' && 'Date column *'}
              {field === 'amountCol' && 'Amount column *'}
              {field === 'descCol' && 'Description column *'}
              {field === 'payeeCol' && 'Payee (optional)'}
              {field === 'notesCol' && 'Notes (optional)'}
            </label>
            <select
              id={`select-${field}`}
              value={(mapping[field] as string) ?? ''}
              onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))}
              className="w-full rounded-md border px-3 py-1.5 text-sm"
              data-testid={`select-${field}`}
            >
              <option value="">— select —</option>
              {csvHeaders.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            {validation?.[field] && (
              <>
                <ConfidenceBadge value={validation[field]} />
                {validation[field].col !== null && validation[field].col !== mapping[field] && (
                  <p className="text-xs text-amber-700 mt-0.5">
                    AI suggests:{' '}
                    <button className="underline" onClick={() => applyLLMSuggestion(field)}>
                      {validation[field].col}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        ))}

        <div>
          <label htmlFor="select-dateFormat" className="block text-xs font-medium mb-1">Date format *</label>
          <select
            id="select-dateFormat"
            value={mapping.dateFormat}
            onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value }))}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            data-testid="select-dateFormat"
          >
            {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="select-amountSign" className="block text-xs font-medium mb-1">Amount sign *</label>
          <select
            id="select-amountSign"
            value={mapping.amountSign}
            onChange={(e) => setMapping((m) => ({ ...m, amountSign: e.target.value as 'normal' | 'inverted' }))}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            data-testid="select-amountSign"
          >
            <option value="normal">Expenses are negative</option>
            <option value="inverted">Expenses are positive</option>
          </select>
        </div>

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
      <div className="flex-1 min-w-0 space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm min-h-5">
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
            {previewError && <span className="text-red-600 text-sm">{previewError}</span>}
          </div>

          {/* Parse errors — shown when columns are mapped wrong */}
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

        <div className="overflow-auto rounded-lg border max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm" aria-label="Transaction preview" data-testid="preview-table">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Payee</th>
                <th className="px-3 py-2 text-left font-medium">Notes</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 && !previewLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-sm">
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
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(row.date).toLocaleDateString()}</td>
                    <td className="px-3 py-2 max-w-[180px]"><span className="block truncate">{row.description}</span></td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {row.payeeName ?? '—'}
                      {row.payeeId && <span className="ml-1 text-green-600">✓</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs max-w-[120px]">
                      <span className="block truncate">{row.notes ?? '—'}</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${row.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      {row.suggestedCategory ? (
                        <span
                          className={`text-xs rounded-full px-2 py-0.5 ${
                            row.suggestionConfidence === 'high'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                          title={row.suggestionConfidence === 'medium' ? 'Review suggested — could be personal' : undefined}
                        >
                          {row.suggestedCategory}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.isDuplicate
                        ? <span className="text-xs text-muted-foreground">duplicate</span>
                        : <span className="text-xs text-green-600">new</span>}
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

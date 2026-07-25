'use client'

import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import { useUploadStore } from '@/stores/upload-store'
import type { CsvMapping } from '@/lib/csv-processor'
import type { PreviewRow, FilePreviewMeta } from '@/types'
import { guessMapping, scoreCandidates, type MappedField } from '@/lib/guess-mapping'
import { ColSelect, type MappingValidation } from './col-select'
import { AccountRail } from './account-rail'
import type { Account } from './new-account-form'
import { PreviewTable, previewNewCount } from './preview-table'

const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD']

export function ColumnMapper({
  accounts: initialAccounts = [],
  loadingAccounts = false,
  onAccountCreated,
}: {
  accounts?: Account[]
  loadingAccounts?: boolean
  onAccountCreated?: (account: Account) => void
}) {
  const { files, accountId, profileHit, setStep, setAccountId, reset, removeFile, clearProfileHit } = useUploadStore()
  const csvHeaders = files[0]?.headers ?? []
  const source = files[0]?.source ?? 'csv'
  const displayFilename = files.length === 1 ? files[0].filename : `${files.length} files`

  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  useEffect(() => { setAccounts(initialAccounts) }, [initialAccounts])

  const [mapping, setMapping] = useState<Partial<CsvMapping>>(() => guessMapping([]))
  const [validation, setValidation] = useState<MappingValidation | null>(null)
  const [validating, setValidating] = useState(false)
  const [candidates, setCandidates] = useState<Record<MappedField, { col: string; score: number }[]>>({
    dateCol: [], amountCol: [], descCol: [], notesCol: [],
  })

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [perFile, setPerFile] = useState<FilePreviewMeta[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isValid = !!(mapping.dateCol && mapping.amountCol && mapping.descCol)
  const newRows = previewRows.filter((r) => !r.isDuplicate)
  const set = (field: keyof CsvMapping) => (v: string | undefined) =>
    setMapping((m) => ({ ...m, [field]: v }))

  // ── Initialize mapping: profile hit → pre-fill; else deterministic guess ──
  useEffect(() => {
    if (csvHeaders.length === 0) return
    if (profileHit) {
      setMapping(profileHit.mapping as Partial<CsvMapping>)
    } else {
      setMapping(guessMapping(csvHeaders))
      setCandidates({
        dateCol: scoreCandidates(csvHeaders, 'dateCol'),
        amountCol: scoreCandidates(csvHeaders, 'amountCol'),
        descCol: scoreCandidates(csvHeaders, 'descCol'),
        notesCol: scoreCandidates(csvHeaders, 'notesCol'),
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvHeaders.join(','), profileHit])

  // ── LLM validation: only for non-profile CSV sessions ──
  useEffect(() => {
    if (!csvHeaders.length || !files.length || profileHit) return
    if (source === 'pdf') return
    const firstFile = files[0]
    if (!firstFile?.csvText) return
    const parsed = Papa.parse<Record<string, string>>(firstFile.csvText, { header: true, skipEmptyLines: true })
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
          setMapping((m) => {
            const next = { ...m }
            for (const field of ['dateCol', 'amountCol', 'descCol', 'notesCol'] as const) {
              const v = j.data?.[field]
              if (v?.confidence >= 99 && v.col) next[field] = v.col
            }
            if (j.data?.dateFormat?.confidence >= 99 && j.data.dateFormat.value) next.dateFormat = j.data.dateFormat.value
            if (j.data?.amountSign?.confidence >= 99 && j.data.amountSign.value) next.amountSign = j.data.amountSign.value
            return next
          })
        }
      })
      .catch(() => {})
      .finally(() => setValidating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvHeaders.join(','), files[0]?.csvText, profileHit])

  // ── Auto-preview: debounced, sends all files ──
  useEffect(() => {
    if (!isValid || !accountId || files.length === 0) {
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
          body: JSON.stringify({
            accountId,
            mapping,
            files: files.map((f) => ({ filename: f.filename, csvText: f.csvText })),
          }),
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
        setPerFile(json.meta?.perFile ?? [])
        setParseErrors(json.meta?.errors ?? [])
      } catch {
        setPreviewError('Network error while loading preview.')
      } finally {
        setPreviewLoading(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [mapping, isValid, accountId, files])

  const handleImport = async () => {
    if (!accountId || newRows.length === 0) return
    setImporting(true)
    setImportError(null)
    try {
      const fileMap = new Map<string, typeof newRows>()
      for (const row of newRows) {
        const fname = row.filename ?? files[0]?.filename ?? 'upload.csv'
        if (!fileMap.has(fname)) fileMap.set(fname, [])
        fileMap.get(fname)!.push(row)
      }
      const importFiles = files
        .map((f) => ({
          filename: f.filename,
          rows: (fileMap.get(f.filename) ?? []).map((r) => ({
            date: r.date,
            amount: r.amount,
            description: r.description,
            notes: r.notes ?? null,
            category: r.suggestedCategory ?? null,
            categoryId: r.suggestedCategoryId ?? null,
            payeeId: r.payeeId ?? null,
            duplicateHash: r.duplicateHash,
            rawData: r.rawData,
          })),
        }))
        .filter((f) => f.rows.length > 0)

      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          files: importFiles,
          profile: { headers: csvHeaders, mapping, source },
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

  const newCount = previewNewCount(previewRows)

  return (
    <>
    <style>{`
      @keyframes account-throb {
        0%, 100% { box-shadow: 0 0 0 0 rgb(99 102 241 / 0); border-color: hsl(var(--border)); }
        50%       { box-shadow: 0 0 0 4px rgb(99 102 241 / 0.25); border-color: rgb(99 102 241); }
      }
      @keyframes col-throb {
        0%, 100% { box-shadow: 0 0 0 0 transparent; border-color: hsl(var(--border)); }
        50%       { box-shadow: 0 0 0 2px rgb(245 158 11 / 0.35); border-color: rgb(245 158 11 / 0.55); }
      }
      .account-throb { animation: account-throb 1.4s ease-in-out infinite; }
      .col-throb     { animation: col-throb 2s ease-in-out infinite; }
    `}</style>
    <div className="flex gap-6 h-full min-h-0" data-testid="column-mapper-form">
      {/* Left: account selector + mapping controls */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
        <AccountRail
          accounts={accounts}
          loadingAccounts={loadingAccounts}
          accountId={accountId}
          onAccountIdChange={setAccountId}
          onAccountCreated={(a) => { setAccounts((prev) => [...prev, a]); onAccountCreated?.(a) }}
        />

        {/* Profile hit banner */}
        {profileHit && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-blue-800">
              Saved mapping (used {profileHit.useCount}×, last{' '}
              {new Date(profileHit.lastUsedAt).toLocaleDateString()})
            </p>
            <button
              type="button"
              onClick={clearProfileHit}
              className="text-xs text-blue-600 hover:underline"
            >
              Re-detect columns
            </button>
          </div>
        )}

        <div className="border-t pt-4">
          <p className="text-xs font-semibold text-foreground">Map columns</p>
          <p className="text-xs text-muted-foreground mt-0.5 break-all">{displayFilename}</p>
        </div>

        {/* File list (multi-file) */}
        {files.length > 1 && (
          <div className="space-y-1">
            {files.map((f) => (
              <div key={f.filename} className="flex items-center justify-between text-xs">
                <span className="truncate flex-1">{f.filename}</span>
                {!importing && (
                  <button
                    type="button"
                    onClick={() => removeFile(f.filename)}
                    className="text-muted-foreground hover:text-red-600 ml-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {validating && <p className="text-xs text-muted-foreground">Checking with AI…</p>}

        <ColSelect id="select-dateCol" label="Date column *" value={mapping.dateCol} headers={csvHeaders}
          onChange={set('dateCol')} validation={validation?.dateCol} candidates={candidates.dateCol} required />
        <div>
          <label htmlFor="select-dateFormat" className="block text-xs font-medium mb-1">Date format *</label>
          <select id="select-dateFormat" value={mapping.dateFormat ?? 'MM/DD/YYYY'}
            onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value }))}
            className="w-full rounded-md border px-3 py-1.5 text-sm" data-testid="select-dateFormat">
            {DATE_FORMATS.map((f) => {
              const aiPct = validation?.dateFormat?.value === f ? validation.dateFormat.confidence : null
              return <option key={f} value={f}>{f}{aiPct ? ` — ${aiPct}%` : ''}</option>
            })}
          </select>
        </div>

        <ColSelect id="select-amountCol" label="Amount column *" value={mapping.amountCol} headers={csvHeaders}
          onChange={set('amountCol')} validation={validation?.amountCol} candidates={candidates.amountCol} required />
        <div>
          <label htmlFor="select-amountSign" className="block text-xs font-medium mb-1">Amount sign *</label>
          <select id="select-amountSign" value={mapping.amountSign ?? 'normal'}
            onChange={(e) => setMapping((m) => ({ ...m, amountSign: e.target.value as 'normal' | 'inverted' }))}
            className="w-full rounded-md border px-3 py-1.5 text-sm" data-testid="select-amountSign">
            {(['normal', 'inverted'] as const).map((v) => {
              const label = v === 'normal' ? 'Expenses are negative' : 'Expenses are positive'
              const aiPct = validation?.amountSign?.value === v ? validation.amountSign.confidence : null
              return <option key={v} value={v}>{label}{aiPct ? ` — ${aiPct}%` : ''}</option>
            })}
          </select>
        </div>

        <ColSelect id="select-descCol" label="Description column *" value={mapping.descCol} headers={csvHeaders}
          onChange={set('descCol')} validation={validation?.descCol} candidates={candidates.descCol} required />
        <ColSelect id="select-notesCol" label="Notes (optional)" value={mapping.notesCol} headers={csvHeaders}
          onChange={set('notesCol')} validation={validation?.notesCol} candidates={candidates.notesCol} />

        {/* Import button */}
        <div className="pt-2 space-y-2">
          <button onClick={handleImport}
            disabled={importing || newCount === 0 || previewLoading || !accountId}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            data-testid="confirm-import-btn"
            aria-label={`Import ${newCount} new transactions`}>
            {importing ? 'Importing…' : `Import ${newCount} transaction${newCount !== 1 ? 's' : ''}`}
          </button>
          <button onClick={reset}
            className="w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            data-testid="cancel-import-btn">
            Cancel
          </button>
          {importError && <p className="text-xs text-red-600" role="alert">{importError}</p>}
        </div>
      </div>

      {/* Right: live preview */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-xs min-h-5 flex-wrap">
            {previewLoading && <span className="text-muted-foreground">Updating preview…</span>}
            {!previewLoading && isValid && accountId && (
              <>
                <span><strong>{totalRows}</strong> rows total</span>
                <span className="text-green-600"><strong>{newCount}</strong> new</span>
                {duplicateCount > 0 && <span className="text-muted-foreground"><strong>{duplicateCount}</strong> duplicates</span>}
                {skippedCount > 0 && <span className="text-amber-600"><strong>{skippedCount}</strong> could not be parsed</span>}
              </>
            )}
            {!previewLoading && (!isValid || !accountId) && (
              <span className="text-muted-foreground">
                {!accountId ? 'Select an account above to preview.' : 'Select date, amount, and description columns to preview.'}
              </span>
            )}
            {previewError && <span className="text-red-600">{previewError}</span>}
          </div>

          {/* Per-file row count strip */}
          {perFile.length > 1 && !previewLoading && (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {perFile.map((f) => (
                <span key={f.filename} className="rounded bg-muted px-2 py-0.5">
                  {f.filename} — {f.rowCount} rows
                </span>
              ))}
            </div>
          )}

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

        <PreviewTable rows={previewRows} loading={previewLoading} />
      </div>
    </div>
    </>
  )
}

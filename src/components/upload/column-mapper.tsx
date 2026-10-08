'use client'

import { useState, useEffect, useRef } from 'react'
import { useUploadStore } from '@/stores/upload-store'
import { analyzeCsv } from '@/lib/csv-structure'
import type { CsvMapping } from '@/lib/csv-processor'
import type { PreviewRow, FilePreviewMeta } from '@/types'
import { guessMapping, scoreCandidates, type MappedField } from '@/lib/guess-mapping'
import { detectDateFormat } from '@/lib/date-format'
import { ColSelect } from './col-select'
import { AccountRail } from './account-rail'
import type { Account } from './new-account-form'
import { PreviewTable, previewNewCount } from './preview-table'
import { DateAmbiguityPrompt } from './date-ambiguity-prompt'
import { ReconciliationNotices, type ReconciliationMeta } from './reconciliation-notices'
import { useMappingValidation } from './hooks/use-mapping-validation'
import { ProfileHitBanner } from './profile-hit-banner'

export function ColumnMapper({
  accounts: initialAccounts = [],
  loadingAccounts = false,
  onAccountCreated,
}: { accounts?: Account[]; loadingAccounts?: boolean; onAccountCreated?: (account: Account) => void }) {
  const { files, accountId, profileHit, profileStatus, setStep, setAccountId, reset, removeFile, clearProfileHit, setLastImport } = useUploadStore()
  const csvHeaders = files[0]?.headers ?? []
  const source = files[0]?.source ?? 'csv'
  const displayFilename = files.length === 1 ? files[0].filename : `${files.length} files`

  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  useEffect(() => { setAccounts(initialAccounts) }, [initialAccounts])

  const [mapping, setMapping] = useState<Partial<CsvMapping>>(() => guessMapping([]))
  const [candidates, setCandidates] = useState<Record<MappedField, { col: string; score: number }[]>>({
    dateCol: [], amountCol: [], descCol: [], notesCol: [],
  })

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [perFile, setPerFile] = useState<FilePreviewMeta[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [reconciliations, setReconciliations] = useState<ReconciliationMeta[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Date format auto-detection: ambiguity ask + unrecognised-column hint
  const [dateAmbiguity, setDateAmbiguity] = useState<{ chosen: string; alternatives: string[]; exampleRaw: string } | null>(null)
  const [dateUnrecognised, setDateUnrecognised] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [signSuggestionDismissed, setSignSuggestionDismissed] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchedRef = useRef<Set<string>>(new Set())

  const isValid = !!(mapping.dateCol && mapping.amountCol && mapping.descCol)
  const newRows = previewRows.filter((r) => !r.isDuplicate)
  const set = (field: keyof CsvMapping) => (v: string | undefined) => {
    touchedRef.current.add(field)
    setMapping((m) => ({ ...m, [field]: v }))
  }
  const { validation, validating } = useMappingValidation({
    csvHeaders,
    files,
    source,
    profileHit,
    profileStatus,
    mapping,
    setMapping,
    touchedRef,
  })

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

  // ── Date format auto-detection: scans the actual values in the mapped date
  // column. Unambiguous → applied silently. Ambiguous (MM/DD vs DD/MM) → applied
  // with a regional prior + an inline confirmation prompt. Nothing recognised →
  // hint shown; the preview's per-row errors guide the user from there. ──
  useEffect(() => {
    setDateAmbiguity(null)
    setDateUnrecognised(false)
    if (!mapping.dateCol || files.length === 0) return
    // A saved profile carries an explicit format — respect it, no detection.
    if ((profileHit?.mapping as Partial<CsvMapping> | undefined)?.dateFormat) return

    const samples: string[] = []
    for (const f of files) {
      const structure = analyzeCsv(f.csvText)
      const colIdx = structure.headers.indexOf(mapping.dateCol)
      if (colIdx === -1) continue
      for (const row of structure.rows.slice(0, 250)) {
        const v = row[colIdx]?.trim()
        if (v) samples.push(v)
      }
    }
    const det = detectDateFormat(samples)
    if (det.format) {
      setMapping((m) => ({ ...m, dateFormat: det.format! }))
      if (det.ambiguous) {
        setDateAmbiguity({ chosen: det.format, alternatives: det.alternatives, exampleRaw: det.exampleRaw ?? '' })
      }
    } else {
      setMapping((m) => {
        if (!m.dateFormat) return m
        const next = { ...m }
        delete next.dateFormat
        return next
      })
      setDateUnrecognised(samples.length > 0)
    }
  }, [mapping.dateCol, files, profileHit])

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
        setReconciliations(json.meta?.reconciliations ?? [])
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
            occurrence: r.occurrence ?? 0,
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
      setLastImport({ imported: json.data?.imported ?? 0, skipped: json.data?.skipped ?? 0 })
      setStep('done')
    } catch {
      setImportError('Network error. Please check your connection and try again.')
    } finally {
      setImporting(false)
    }
  }

  const newCount = previewNewCount(previewRows)
  const suggestedSign = validation?.amountSign
  const showSignSuggestion =
    !signSuggestionDismissed &&
    !!suggestedSign &&
    suggestedSign.confidence >= 90 &&
    (suggestedSign.value === 'normal' || suggestedSign.value === 'inverted') &&
    suggestedSign.value !== (mapping.amountSign ?? 'normal')

  return (
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

        {profileHit && <ProfileHitBanner profileHit={profileHit} onRedetect={clearProfileHit} />}

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
                    aria-label={`Remove ${f.filename}`}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {validating && <p className="text-xs text-muted-foreground">Checking with AI…</p>}

        <ColSelect id="select-dateCol" label="Date column *" value={mapping.dateCol} headers={csvHeaders}
          onChange={set('dateCol')} validation={validation?.dateCol} candidates={candidates.dateCol} required />

        {/* Date format is auto-detected — only surfaces when genuinely ambiguous (MM/DD vs DD/MM) */}
        {dateAmbiguity && (
          <DateAmbiguityPrompt ambiguity={dateAmbiguity} onChoose={(fmt) => {
            setMapping((m) => ({ ...m, dateFormat: fmt }))
            setDateAmbiguity((a) => (a ? { ...a, chosen: fmt } : a))
          }} />
        )}
        {dateUnrecognised && mapping.dateCol && (
          <p className="text-xs text-amber-700" data-testid="date-unrecognised-hint">
            We can&apos;t recognise the dates in &quot;{mapping.dateCol}&quot; — double-check the date column selection.
          </p>
        )}

        <ColSelect id="select-amountCol" label="Amount column *" value={mapping.amountCol} headers={csvHeaders}
          onChange={set('amountCol')} validation={validation?.amountCol} candidates={candidates.amountCol} required />
        <div>
          <label htmlFor="select-amountSign" className="block text-xs font-medium mb-1">Amount sign *</label>
          <select id="select-amountSign" value={mapping.amountSign ?? 'normal'}
            onChange={(e) => {
              touchedRef.current.add('amountSign')
              setMapping((m) => ({ ...m, amountSign: e.target.value as 'normal' | 'inverted' }))
            }}
            className="w-full rounded-md border px-3 py-1.5 text-sm" data-testid="select-amountSign">
            {(['normal', 'inverted'] as const).map((v) => {
              const label = v === 'normal' ? 'Expenses are negative' : 'Expenses are positive'
              const aiPct = validation?.amountSign?.value === v ? validation.amountSign.confidence : null
              return <option key={v} value={v}>{label}{aiPct ? ` — ${aiPct}%` : ''}</option>
            })}
          </select>
        </div>
        {showSignSuggestion && suggestedSign && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1.5" data-testid="sign-suggestion">
            <p className="text-xs text-amber-900">
              AI thinks {suggestedSign.value === 'inverted' ? 'expenses are positive' : 'expenses are negative'} in this file ({suggestedSign.confidence}%).
            </p>
            <div className="flex gap-2">
              <button type="button" className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white"
                onClick={() => { touchedRef.current.add('amountSign'); setMapping((m) => ({ ...m, amountSign: suggestedSign.value as 'normal' | 'inverted' })) }}>
                Switch
              </button>
              <button type="button" className="text-xs text-amber-900 hover:underline" onClick={() => setSignSuggestionDismissed(true)}>
                Keep current
              </button>
            </div>
          </div>
        )}

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
             aria-label={importing ? 'Importing…' : `Import ${newCount} new transactions`}>
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
          <div className="flex items-center gap-4 text-xs min-h-5 flex-wrap" aria-live="polite">
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
            {!previewLoading && <ReconciliationNotices items={reconciliations} />}
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
  )
}

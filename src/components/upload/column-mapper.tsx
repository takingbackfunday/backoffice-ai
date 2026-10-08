'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useUploadStore } from '@/stores/upload-store'
import { analyzeCsv } from '@/lib/csv-structure'
import { isMappingComplete, type CsvMapping } from '@/lib/csv-processor'
import { guessMapping, scoreCandidates, type MappedField } from '@/lib/guess-mapping'
import { detectDateFormat } from '@/lib/date-format'
import { ColSelect } from './col-select'
import { AccountRail } from './account-rail'
import type { Account } from './new-account-form'
import { PreviewTable, previewNewCount } from './preview-table'
import { DateAmbiguityPrompt } from './date-ambiguity-prompt'
import { AmountFields } from './amount-fields'
import { PreviewSummary } from './preview-summary'
import { ConfirmDialog } from './confirm-dialog'
import { ReconciliationNotices } from './reconciliation-notices'
import { AiMappingBanner } from './ai-mapping-banner'
import { FileListPanel } from './file-list-panel'
import { resetUploadDropzone } from '@/stores/upload-dropzone-store'
import { useImportPreview } from './hooks/use-import-preview'
import { useImportSubmit } from './hooks/use-import-submit'
import { useMappingValidation } from './hooks/use-mapping-validation'
import { ProfileHitBanner } from './profile-hit-banner'

export function ColumnMapper({
  accounts: initialAccounts = [],
  loadingAccounts = false,
  onAccountCreated,
}: { accounts?: Account[]; loadingAccounts?: boolean; onAccountCreated?: (account: Account) => void }) {
  const { files, accountId, profileHit, profileStatus, setAccountId, reset, clearProfileHit } = useUploadStore()
  const csvHeaders = files[0]?.headers ?? []
  const source = files[0]?.source ?? 'csv'
  const displayFilename = files.length === 1 ? files[0].filename : `${files.length} files`
  const firstCsvText = files[0]?.csvText
  const samples = useMemo(() => {
    if (!firstCsvText) return {}
    const { headers, rows } = analyzeCsv(firstCsvText)
    const out: Record<string, string> = {}
    headers.forEach((header, index) => {
      if (!header || header in out) return
      const value = rows.slice(0, 50).map((row) => row[index]?.trim()).find(Boolean)
      if (value) out[header] = value.length > 24 ? `${value.slice(0, 23)}…` : value
    })
    return out
  }, [firstCsvText])

  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  useEffect(() => { setAccounts(initialAccounts) }, [initialAccounts])

  const [mapping, setMapping] = useState<Partial<CsvMapping>>(() => guessMapping([]))
  const [candidates, setCandidates] = useState<Record<MappedField, { col: string; score: number }[]>>({
    dateCol: [], amountCol: [], descCol: [], notesCol: [], debitCol: [], creditCol: [],
  })
  const [detectedSplit, setDetectedSplit] = useState(false)

  // Date format auto-detection: ambiguity ask + unrecognised-column hint
  const [dateAmbiguity, setDateAmbiguity] = useState<{ chosen: string; alternatives: string[]; exampleRaw: string } | null>(null)
  const [dateUnrecognised, setDateUnrecognised] = useState(false)
  const [startOverOpen, setStartOverOpen] = useState(false)
  const [partialImportOpen, setPartialImportOpen] = useState(false)

  const touchedRef = useRef<Set<string>>(new Set())

  const isValid = isMappingComplete(mapping)
  const {
    previewRows,
    totalRows,
    skippedCount,
    duplicateCount,
    perFile,
    parseErrors,
    reconciliations,
    previewLoading,
    previewError,
  } = useImportPreview({ mapping, isValid, accountId, files })

  const { importing, importError, submit: handleImport } = useImportSubmit({
    accountId,
    files,
    previewRows,
    csvHeaders,
    mapping,
    source,
    unreadableCount: skippedCount,
  })
  const {
    validation,
    validating,
    aiPendingFields,
    aiChanges,
    keepAiChanges,
    undoAiChanges,
    clearAiField,
  } = useMappingValidation({
    csvHeaders,
    files,
    source,
    profileHit,
    profileStatus,
    mapping,
    setMapping,
    touchedRef,
  })
  const set = (field: keyof CsvMapping) => (v: string | undefined) => {
    touchedRef.current.add(field)
    clearAiField(field)
    setMapping((m) => ({ ...m, [field]: v }))
  }

  // ── Initialize mapping: profile hit → pre-fill; else deterministic guess ──
  useEffect(() => {
    if (csvHeaders.length === 0) return
    if (profileHit) {
      setMapping(profileHit.mapping as Partial<CsvMapping>)
      setDetectedSplit(false)
    } else {
      const guessed = guessMapping(csvHeaders)
      setMapping(guessed)
      setDetectedSplit(guessed.amountMode === 'split')
    }
    setCandidates({
      dateCol: scoreCandidates(csvHeaders, 'dateCol'),
      amountCol: scoreCandidates(csvHeaders, 'amountCol'),
      descCol: scoreCandidates(csvHeaders, 'descCol'),
      notesCol: scoreCandidates(csvHeaders, 'notesCol'),
      debitCol: scoreCandidates(csvHeaders, 'debitCol'),
      creditCol: scoreCandidates(csvHeaders, 'creditCol'),
    })
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

  const newCount = previewNewCount(previewRows)
  const hasMismatch = reconciliations.some((item) => !item.matched)

  const requestImport = () => {
    keepAiChanges()
    if (skippedCount > 0 || hasMismatch) setPartialImportOpen(true)
    else void handleImport()
  }

  return (
    <div className="flex gap-6" data-testid="column-mapper-form">
      {/* Left: account selector + mapping controls */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4">
        <AccountRail
          accounts={accounts}
          loadingAccounts={loadingAccounts}
          accountId={accountId}
          preselectedFromProfile={!!profileHit?.accountId && accountId === profileHit.accountId}
          onAccountIdChange={setAccountId}
          onAccountCreated={(a) => { setAccounts((prev) => [...prev, a]); onAccountCreated?.(a) }}
        />

        {profileHit && <ProfileHitBanner profileHit={profileHit} onRedetect={clearProfileHit} />}

        <div className="border-t pt-4">
          <p className="text-xs font-semibold text-foreground">Map columns</p>
          <p className="text-xs text-muted-foreground mt-0.5 break-all">{displayFilename}</p>
        </div>

        {aiChanges.length > 0 && (
          <AiMappingBanner changes={aiChanges} onUndo={undoAiChanges} onKeep={keepAiChanges} />
        )}

        <FileListPanel importing={importing} />

        {validating && <p className="text-xs text-muted-foreground">Checking with AI…</p>}

        <ColSelect id="select-dateCol" label="Date column *" value={mapping.dateCol} headers={csvHeaders}
          onChange={set('dateCol')} onUserChange={() => clearAiField('dateCol')} validation={validation?.dateCol}
          candidates={candidates.dateCol} samples={samples} aiChanged={aiPendingFields.has('dateCol')} required />

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

        <AmountFields
          mapping={mapping}
          setMapping={setMapping}
          touchedRef={touchedRef}
          headers={csvHeaders}
          validation={validation}
          candidates={candidates}
          detectedSplit={detectedSplit}
          samples={samples}
          aiPendingFields={aiPendingFields}
          clearAiField={clearAiField}
        />

        <ColSelect id="select-descCol" label="Description column *" value={mapping.descCol} headers={csvHeaders}
          onChange={set('descCol')} onUserChange={() => clearAiField('descCol')} validation={validation?.descCol}
          candidates={candidates.descCol} samples={samples} aiChanged={aiPendingFields.has('descCol')} required />
        <ColSelect id="select-notesCol" label="Notes (optional)" value={mapping.notesCol} headers={csvHeaders}
          onChange={set('notesCol')} onUserChange={() => clearAiField('notesCol')} validation={validation?.notesCol}
          candidates={candidates.notesCol} samples={samples} aiChanged={aiPendingFields.has('notesCol')} />

        {/* Import button */}
        <div className="sticky bottom-0 -mx-1 mt-auto bg-background px-1 pt-3 pb-1 border-t space-y-2">
          <button onClick={requestImport}
            disabled={importing || newCount === 0 || previewLoading || !accountId}
             className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
             data-testid="confirm-import-btn"
             aria-label={importing ? 'Importing…' : `Import ${newCount} new transactions`}>
            {importing ? 'Importing…' : `Import ${newCount} transaction${newCount !== 1 ? 's' : ''}`}
          </button>
          <button onClick={() => setStartOverOpen(true)}
            className="w-full rounded-md px-4 py-2 text-xs text-muted-foreground hover:underline"
            data-testid="cancel-import-btn">
            Start over
          </button>
          {importError && <p className="text-xs text-red-600" role="alert">{importError}</p>}
        </div>
      </div>

      {/* Right: live preview */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <PreviewSummary
          previewLoading={previewLoading}
          isValid={isValid}
          accountId={accountId}
          totalRows={totalRows}
          newCount={newCount}
          duplicateCount={duplicateCount}
          skippedCount={skippedCount}
          previewError={previewError}
          reconciliations={reconciliations}
          perFile={perFile}
          parseErrors={parseErrors}
        />

        <PreviewTable rows={previewRows} loading={previewLoading} />
      </div>
      <ConfirmDialog
        open={startOverOpen}
        title="Discard this import?"
        body="Your files and column choices will be cleared."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setStartOverOpen(false)}
        onConfirm={() => { resetUploadDropzone(); reset() }}
      />
      <ConfirmDialog
        open={partialImportOpen}
        title="Some rows won't be imported"
        confirmLabel={`Import ${newCount} transactions anyway`}
        cancelLabel="Go back and fix"
        onCancel={() => setPartialImportOpen(false)}
        onConfirm={() => { setPartialImportOpen(false); void handleImport() }}
      >
        <div className="space-y-3 text-sm">
          {skippedCount > 0 && (
            <div className="space-y-1">
              <p>{skippedCount} rows couldn&apos;t be read and won&apos;t be imported.</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
                {parseErrors.slice(0, 5).map((error, index) => <li key={index}>{error}</li>)}
              </ul>
            </div>
          )}
          {hasMismatch && (
            <div className="space-y-1 text-xs">
              <p>Parsed totals differ from the statement summary.</p>
              <ReconciliationNotices items={reconciliations.filter((item) => !item.matched)} />
            </div>
          )}
        </div>
      </ConfirmDialog>
    </div>
  )
}

'use client'

import type { FilePreviewMeta } from '@/types'
import type { ReconciliationMeta } from './reconciliation-notices'
import { ReconciliationNotices } from './reconciliation-notices'

export function PreviewSummary({
  previewLoading,
  isValid,
  accountId,
  totalRows,
  newCount,
  duplicateCount,
  skippedCount,
  previewError,
  reconciliations,
  perFile,
  parseErrors,
}: {
  previewLoading: boolean
  isValid: boolean
  accountId: string | null
  totalRows: number
  newCount: number
  duplicateCount: number
  skippedCount: number
  previewError: string | null
  reconciliations: ReconciliationMeta[]
  perFile: FilePreviewMeta[]
  parseErrors: string[]
}) {
  return (
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
        {!previewLoading && <ReconciliationNotices items={reconciliations.filter((item) => item.matched)} />}
      </div>

      {!previewLoading && <ReconciliationNotices items={reconciliations.filter((item) => !item.matched)} variant="banner" />}

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
  )
}

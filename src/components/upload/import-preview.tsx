'use client'

import { useState } from 'react'
import { useUploadStore } from '@/stores/upload-store'

export function ImportPreview() {
  const { previewRows, totalRows, duplicateCount, accountId, filename, setStep } = useUploadStore()
  const resetStore = useUploadStore((s) => s.reset)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const newRows = previewRows.filter((r) => !r.isDuplicate)

  const handleImport = async () => {
    if (!accountId || !filename) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, filename, rows: newRows }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Import failed. Please try again.')
        return
      }
      setStep('done')
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="import-preview">
      <div className="flex items-center gap-6 text-sm">
        <span><strong>{totalRows}</strong> rows parsed</span>
        <span className="text-green-600"><strong>{newRows.length}</strong> new</span>
        {duplicateCount > 0 && (
          <span className="text-muted-foreground"><strong>{duplicateCount}</strong> duplicates (will be skipped)</span>
        )}
      </div>

      <div className="overflow-auto rounded-lg border max-h-96">
        <table className="w-full text-sm" aria-label="Transaction preview" data-testid="preview-table">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.slice(0, 100).map((row) => (
              <tr
                key={row.duplicateHash}
                className={row.isDuplicate ? 'opacity-40' : ''}
                data-testid={`preview-row-${row.isDuplicate ? 'duplicate' : 'new'}`}
              >
                <td className="px-3 py-2">{new Date(row.date).toLocaleDateString()}</td>
                <td className="px-3 py-2 max-w-xs"><span className="block truncate">{row.description}</span></td>
                <td className={`px-3 py-2 text-right font-mono ${row.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)}
                </td>
                <td className="px-3 py-2">
                  {row.isDuplicate
                    ? <span className="text-xs text-muted-foreground">duplicate</span>
                    : <span className="text-xs text-green-600">new</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert" data-testid="import-error">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleImport}
          disabled={loading || newRows.length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          data-testid="confirm-import-btn"
          aria-label={`Import ${newRows.length} new transactions`}
        >
          {loading ? 'Importing…' : `Import ${newRows.length} transactions`}
        </button>
        <button
          onClick={resetStore}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          data-testid="cancel-import-btn"
          aria-label="Cancel import and start over"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

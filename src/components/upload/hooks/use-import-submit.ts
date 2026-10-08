import { useState } from 'react'
import { useUploadStore } from '@/stores/upload-store'
import type { CsvMapping } from '@/lib/csv-processor'
import type { PreviewRow, UploadFile } from '@/types'

export function useImportSubmit({
  accountId,
  files,
  previewRows,
  csvHeaders,
  mapping,
  source,
  unreadableCount,
}: {
  accountId: string | null
  files: UploadFile[]
  previewRows: PreviewRow[]
  csvHeaders: string[]
  mapping: Partial<CsvMapping>
  source: UploadFile['source']
  unreadableCount: number
}) {
  const setLastImport = useUploadStore((s) => s.setLastImport)
  const setStep = useUploadStore((s) => s.setStep)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const newRows = previewRows.filter((r) => !r.isDuplicate)

  const submit = async () => {
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
      setLastImport({
        imported: json.data?.imported ?? 0,
        skipped: json.data?.skipped ?? 0,
        unreadable: unreadableCount,
        jobIds: json.data?.jobIds ?? [],
      })
      setStep('done')
    } catch {
      setImportError('Network error. Please check your connection and try again.')
    } finally {
      setImporting(false)
    }
  }

  return { importing, importError, submit }
}

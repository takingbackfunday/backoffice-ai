import { useEffect, useRef, useState } from 'react'
import type { CsvMapping } from '@/lib/csv-processor'
import type { FilePreviewMeta, PreviewRow, UploadFile } from '@/types'
import type { ReconciliationMeta } from '../reconciliation-notices'

export function useImportPreview({
  mapping,
  isValid,
  accountId,
  files,
}: {
  mapping: Partial<CsvMapping>
  isValid: boolean
  accountId: string | null
  files: UploadFile[]
}) {
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [perFile, setPerFile] = useState<FilePreviewMeta[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [reconciliations, setReconciliations] = useState<ReconciliationMeta[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  return {
    previewRows,
    totalRows,
    skippedCount,
    duplicateCount,
    perFile,
    parseErrors,
    reconciliations,
    previewLoading,
    previewError,
  }
}

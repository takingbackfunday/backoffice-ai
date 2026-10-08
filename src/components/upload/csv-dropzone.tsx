'use client'

import { useCallback, useRef, useState } from 'react'
import { useUploadStore } from '@/stores/upload-store'
import { headerSignature } from '@/lib/import-signature'
import { analyzeCsv } from '@/lib/csv-structure'
import type { ExcelSheetInfo, Workbook } from '@/lib/excel'
import type { UploadFile } from '@/types'

interface PendingSheetPick {
  id: string
  filename: string
  workbook: Workbook
  sheets: ExcelSheetInfo[]
}

export function CsvDropzone({ compact = false }: { compact?: boolean } = {}) {
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState<'pdf' | 'excel' | 'file' | null>(null)
  const busyRef = useRef(false)
  const [errors, setErrors] = useState<{ filename: string; reason: string }[]>([])
  const [pendingPicks, setPendingPicks] = useState<PendingSheetPick[]>([])
  const [sheetChoice, setSheetChoice] = useState<Record<string, string>>({})
  const addFiles = useUploadStore((s) => s.addFiles)
  const setProfileHit = useUploadStore((s) => s.setProfileHit)
  const setProfileStatus = useUploadStore((s) => s.setProfileStatus)

  const headersFromCsv = useCallback((csvText: string): string[] => {
    // Structure-aware header extraction: skips statement preambles and
    // detects the real header row (see csv-structure.ts).
    const { headers: detected } = analyzeCsv(csvText)
    const seen = new Set<string>()
    return detected.map((h) => h.trim()).filter((h) => {
      if (!h || seen.has(h)) return false
      seen.add(h)
      return true
    })
  }, [])

  const parseCsv = useCallback((file: File): Promise<UploadFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const csvText = e.target?.result as string
        const headers = headersFromCsv(csvText)
        if (headers.length === 0) {
          reject(new Error('Could not read CSV headers. Make sure the file has a header row.'))
          return
        }
        resolve({ filename: file.name, headers, csvText, source: 'csv' })
      }
      reader.onerror = () => reject(new Error('Could not read the CSV file.'))
      reader.readAsText(file)
    })
  }, [headersFromCsv])

  const parsePdf = useCallback(async (file: File): Promise<UploadFile> => {
    if (file.size > 10 * 1024 * 1024) throw new Error('PDF too large (max 10 MB).')
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error('Could not read the PDF file.'))
      reader.readAsDataURL(file)
    })
    const res = await fetch('/api/upload/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf: dataUri }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error ?? 'Could not extract transactions from this PDF.')
    }
    return { filename: file.name, headers: json.data.headers, csvText: json.data.csvText, source: 'pdf' }
  }, [])

  // Excel → UploadFile for a chosen sheet. Multi-sheet workbooks get the
  // sheet name appended so picking two sheets from one file doesn't collide
  // with the duplicate-filename guard.
  const excelSheetToUploadFile = useCallback(
    async (filename: string, workbook: Workbook, sheetName: string, multiSheet: boolean): Promise<UploadFile> => {
      const { workbookSheetToCsv } = await import('@/lib/excel')
      const csvText = workbookSheetToCsv(workbook, sheetName)
      const headers = headersFromCsv(csvText)
      if (headers.length === 0) {
        throw new Error(`Sheet "${sheetName}" has no readable header row.`)
      }
      return {
        filename: multiSheet ? `${filename} — ${sheetName}` : filename,
        headers,
        csvText,
        source: 'excel',
      }
    },
    [headersFromCsv]
  )

  const ingest = useCallback(async (parsed: UploadFile[], parseErrors: { filename: string; reason: string }[]) => {
    if (parsed.length === 0) {
      setErrors(parseErrors)
      return
    }

    const wasFirstUpload = useUploadStore.getState().files.length === 0
    if (wasFirstUpload) setProfileStatus('loading')
    const result = addFiles(parsed)

    const allErrors = [...parseErrors, ...result.rejected]
    if (allErrors.length > 0) setErrors(allErrors)

    if (!wasFirstUpload) return
    if (result.accepted.length === 0) {
      setProfileStatus('idle')
      return
    }
    // Profile lookup on first upload of the session
    const sig = headerSignature(result.accepted[0].headers)
    try {
      const res = await fetch(`/api/import-profiles?signature=${sig}`)
      if (res.ok) {
        const json = await res.json()
        if (json.data) setProfileHit(json.data)
      }
    } catch {
      // Non-critical — continue without profile
    } finally {
      setProfileStatus('done')
    }
  }, [addFiles, setProfileHit, setProfileStatus])

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const allFiles = Array.from(fileList)
    if (allFiles.length === 0) return

    if (busyRef.current) return
    busyRef.current = true
    setErrors([])
    const names = allFiles.map((f) => f.name.toLowerCase())
    setProcessing(
      names.some((n) => n.endsWith('.pdf')) ? 'pdf'
      : names.some((n) => n.endsWith('.xlsx') || n.endsWith('.xls')) ? 'excel'
      : 'file'
    )
    try {
      const newPicks: PendingSheetPick[] = []
      const results = await Promise.allSettled(
        allFiles.map(async (file): Promise<UploadFile> => {
          const name = file.name.toLowerCase()
          if (name.endsWith('.csv')) return parseCsv(file)
          if (name.endsWith('.pdf')) return parsePdf(file)
          if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
            const buffer = await file.arrayBuffer()
            const { readWorkbook, listWorkbookSheets } = await import('@/lib/excel')
            const workbook = readWorkbook(buffer)
            const sheets = listWorkbookSheets(workbook)
            if (sheets.length === 0) throw new Error('This workbook has no sheets with data.')
            if (sheets.length === 1) {
              return excelSheetToUploadFile(file.name, workbook, sheets[0].name, false)
            }
            // Multiple sheets — the user picks below before anything is ingested.
            newPicks.push({
              id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              filename: file.name,
              workbook,
              sheets,
            })
            throw new PendingPickSentinel()
          }
          throw new Error('Please upload a .csv, .xlsx, .xls or .pdf file.')
        })
      )

      const parsed: UploadFile[] = []
      const parseErrors: { filename: string; reason: string }[] = []

      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          parsed.push(r.value)
        } else if (!(r.reason instanceof PendingPickSentinel)) {
          parseErrors.push({
            filename: allFiles[i].name,
            reason: r.reason instanceof Error ? r.reason.message : 'Failed to parse file.',
          })
        }
      })

      if (newPicks.length > 0) {
        setPendingPicks((prev) => [
          ...prev.filter((p) => !newPicks.some((n) => n.filename === p.filename)),
          ...newPicks,
        ])
        setSheetChoice((prev) => {
          const next = { ...prev }
          for (const pick of newPicks) {
            next[pick.id] = pick.sheets[0].name
          }
          return next
        })
      }

      await ingest(parsed, parseErrors)
    } finally {
      busyRef.current = false
      setProcessing(null)
    }
  }, [parseCsv, parsePdf, excelSheetToUploadFile, ingest])

  const confirmSheetPick = useCallback(async (pick: PendingSheetPick) => {
    if (busyRef.current) return
    busyRef.current = true
    setProcessing('excel')
    const sheetName = sheetChoice[pick.id] ?? pick.sheets[0].name
    setPendingPicks((prev) => prev.filter((p) => p !== pick))
    try {
      const file = await excelSheetToUploadFile(pick.filename, pick.workbook, sheetName, true)
      await ingest([file], [])
    } catch (err) {
      setErrors((prev) => [
        ...prev,
        { filename: pick.filename, reason: err instanceof Error ? err.message : 'Failed to parse sheet.' },
      ])
    } finally {
      busyRef.current = false
      setProcessing(null)
    }
  }, [sheetChoice, excelSheetToUploadFile, ingest])

  const dismissSheetPick = useCallback((pick: PendingSheetPick) => {
    setPendingPicks((prev) => prev.filter((p) => p !== pick))
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  return (
    <div className="max-w-lg">
      <label
        htmlFor="csv-file-input"
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed ${compact ? 'p-4' : 'p-12'} transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
          processing ? 'cursor-wait opacity-80' : 'cursor-pointer'
        } ${
          dragging ? 'border-foreground bg-muted' : 'border-border hover:border-foreground/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="csv-dropzone"
        aria-label="Drop CSV, Excel or PDF files here or click to select"
      >
        {!compact && <span className="text-4xl mb-4" aria-hidden="true">{processing ? '⏳' : '📂'}</span>}
        {processing === 'pdf' ? (
          <>
            <p className="font-medium text-sm animate-pulse">Extracting transactions from PDF…</p>
            <p className="text-xs text-muted-foreground mt-1">This can take up to a minute</p>
          </>
        ) : processing === 'excel' ? (
          <p className="font-medium text-sm animate-pulse">Reading workbook…</p>
        ) : processing === 'file' ? (
          <p className="font-medium text-sm animate-pulse">Reading file…</p>
        ) : compact ? (
          <p className="text-sm">Add more files with the same columns — drop or click</p>
        ) : (
          <>
            <p className="font-medium text-sm">Drop your CSV, Excel or PDF files here</p>
            <p className="text-xs text-muted-foreground mt-1">bank statements or spreadsheet exports — or click to browse</p>
          </>
        )}
        <input
          id="csv-file-input"
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          multiple
          className="sr-only"
          disabled={processing !== null}
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files) }}
          data-testid="csv-file-input"
          aria-label="Select CSV, Excel or PDF files"
        />
      </label>

      {pendingPicks.length > 0 && (
        <div className="mt-3 space-y-2" data-testid="sheet-pickers">
          {pendingPicks.map((pick) => (
            <div
              key={pick.id}
              className="rounded-lg border border-border p-3 space-y-2"
              data-testid={`sheet-picker-${pick.filename}`}
            >
              <p className="text-sm font-medium">
                {pick.filename}
                <span className="block text-xs font-normal text-muted-foreground">
                  This workbook has {pick.sheets.length} sheets — which one should be imported?
                </span>
              </p>
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  value={sheetChoice[pick.id] ?? pick.sheets[0].name}
                  onChange={(e) =>
                    setSheetChoice((prev) => ({ ...prev, [pick.id]: e.target.value }))
                  }
                  aria-label={`Sheet to import from ${pick.filename}`}
                >
                  {pick.sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} — {s.rowCount} rows
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
                  onClick={() => confirmSheetPick(pick)}
                >
                  Use sheet
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => dismissSheetPick(pick)}
                >
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-3 space-y-1" role="alert" data-testid="csv-errors">
          {errors.map((err, i) => (
            <p key={i} className="text-sm text-red-600">
              {err.filename}: {err.reason}
            </p>
          ))}
          <button
            type="button"
            onClick={() => setErrors([])}
            className="text-xs text-muted-foreground hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

// Internal marker so multi-sheet workbooks are excluded from the error list —
// they're not failures, they just need the user's sheet choice first.
class PendingPickSentinel extends Error {
  constructor() {
    super('pending sheet pick')
    this.name = 'PendingPickSentinel'
  }
}

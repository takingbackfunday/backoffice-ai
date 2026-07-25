'use client'

import { useCallback, useState } from 'react'
import Papa from 'papaparse'
import { useUploadStore } from '@/stores/upload-store'
import { headerSignature } from '@/lib/import-signature'
import type { UploadFile } from '@/types'

export function CsvDropzone() {
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<{ filename: string; reason: string }[]>([])
  const addFiles = useUploadStore((s) => s.addFiles)
  const setProfileHit = useUploadStore((s) => s.setProfileHit)

  const parseCsv = useCallback((file: File): Promise<UploadFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const csvText = e.target?.result as string
        const result = Papa.parse<Record<string, string>>(csvText, { header: true, preview: 1 })
        const headers = result.meta.fields ?? []
        if (headers.length === 0) {
          reject(new Error('Could not read CSV headers. Make sure the file has a header row.'))
          return
        }
        resolve({ filename: file.name, headers, csvText, source: 'csv' })
      }
      reader.onerror = () => reject(new Error('Could not read the CSV file.'))
      reader.readAsText(file)
    })
  }, [])

  const parsePdf = useCallback(async (file: File): Promise<UploadFile> => {
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

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const allFiles = Array.from(fileList)
    if (allFiles.length === 0) return

    setErrors([])
    const hasPdf = allFiles.some((f) => f.name.toLowerCase().endsWith('.pdf'))
    setProcessing(hasPdf)

    const results = await Promise.allSettled(
      allFiles.map((file) => {
        const name = file.name.toLowerCase()
        if (name.endsWith('.csv')) return parseCsv(file)
        if (name.endsWith('.pdf')) return parsePdf(file)
        return Promise.reject(new Error('Please upload a .csv or .pdf file.'))
      })
    )

    setProcessing(false)

    const parsed: UploadFile[] = []
    const parseErrors: { filename: string; reason: string }[] = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        parsed.push(r.value)
      } else {
        parseErrors.push({
          filename: allFiles[i].name,
          reason: r.reason instanceof Error ? r.reason.message : 'Failed to parse file.',
        })
      }
    })

    if (parsed.length === 0) {
      setErrors(parseErrors)
      return
    }

    const wasFirstUpload = useUploadStore.getState().files.length === 0
    const result = addFiles(parsed)

    const allErrors = [...parseErrors, ...result.rejected]
    if (allErrors.length > 0) setErrors(allErrors)

    // Profile lookup on first upload of the session
    if (result.accepted.length > 0 && wasFirstUpload) {
      const sig = headerSignature(result.accepted[0].headers)
      try {
        const res = await fetch(`/api/import-profiles?signature=${sig}`)
        if (res.ok) {
          const json = await res.json()
          if (json.data) setProfileHit(json.data)
        }
      } catch {
        // Non-critical — continue without profile
      }
    }
  }, [addFiles, setProfileHit, parseCsv, parsePdf])

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
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
          processing ? 'cursor-wait opacity-80' : 'cursor-pointer'
        } ${
          dragging ? 'border-foreground bg-muted' : 'border-border hover:border-foreground/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="csv-dropzone"
        aria-label="Drop CSV or PDF files here or click to select"
      >
        <span className="text-4xl mb-4" aria-hidden="true">{processing ? '⏳' : '📂'}</span>
        {processing ? (
          <>
            <p className="font-medium text-sm animate-pulse">Extracting transactions from PDF…</p>
            <p className="text-xs text-muted-foreground mt-1">This can take up to a minute</p>
          </>
        ) : (
          <>
            <p className="font-medium text-sm">Drop your CSV or PDF files here</p>
            <p className="text-xs text-muted-foreground mt-1">bank statements or CSV exports — or click to browse</p>
          </>
        )}
        <input
          id="csv-file-input"
          type="file"
          accept=".csv,.pdf"
          multiple
          className="sr-only"
          disabled={processing}
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files) }}
          data-testid="csv-file-input"
          aria-label="Select CSV or PDF files"
        />
      </label>

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

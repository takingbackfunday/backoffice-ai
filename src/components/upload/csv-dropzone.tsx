'use client'

import { useCallback, useState } from 'react'
import Papa from 'papaparse'
import { useUploadStore } from '@/stores/upload-store'

export function CsvDropzone() {
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setCsvData = useUploadStore((s) => s.setCsvData)

  const handleCsv = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const csvText = e.target?.result as string
        const result = Papa.parse<Record<string, string>>(csvText, {
          header: true,
          preview: 1,
        })
        const headers = result.meta.fields ?? []
        if (headers.length === 0) {
          setError('Could not read CSV headers. Make sure the file has a header row.')
          return
        }
        setCsvData({ filename: file.name, headers, csvText })
      }
      reader.readAsText(file)
    },
    [setCsvData]
  )

  const handlePdf = useCallback(
    (file: File) => {
      setProcessing(true)
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const dataUri = e.target?.result as string
          const res = await fetch('/api/upload/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdf: dataUri }),
          })
          const json = await res.json()
          if (!res.ok || json.error) {
            setError(json.error ?? 'Could not extract transactions from this PDF.')
            return
          }
          setCsvData({ filename: file.name, headers: json.data.headers, csvText: json.data.csvText })
        } catch {
          setError('Network error while processing the PDF.')
        } finally {
          setProcessing(false)
        }
      }
      reader.onerror = () => {
        setError('Could not read the PDF file.')
        setProcessing(false)
      }
      reader.readAsDataURL(file)
    },
    [setCsvData]
  )

  const handleFile = useCallback(
    (file: File) => {
      setError(null)
      const name = file.name.toLowerCase()
      if (name.endsWith('.csv')) {
        handleCsv(file)
      } else if (name.endsWith('.pdf')) {
        handlePdf(file)
      } else {
        setError('Please upload a .csv or .pdf file.')
      }
    },
    [handleCsv, handlePdf]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
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
        aria-label="Drop a CSV or PDF file here or click to select"
      >
        <span className="text-4xl mb-4" aria-hidden="true">{processing ? '⏳' : '📂'}</span>
        {processing ? (
          <>
            <p className="font-medium text-sm animate-pulse">Extracting transactions from PDF…</p>
            <p className="text-xs text-muted-foreground mt-1">This can take up to a minute</p>
          </>
        ) : (
          <>
            <p className="font-medium text-sm">Drop your CSV or PDF file here</p>
            <p className="text-xs text-muted-foreground mt-1">bank statement or CSV export — or click to browse</p>
          </>
        )}
        <input
          id="csv-file-input"
          type="file"
          accept=".csv,.pdf"
          className="sr-only"
          disabled={processing}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          data-testid="csv-file-input"
          aria-label="Select CSV or PDF file"
        />
      </label>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert" data-testid="csv-error">
          {error}
        </p>
      )}
    </div>
  )
}

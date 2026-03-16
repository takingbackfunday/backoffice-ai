'use client'

import { useCallback, useState } from 'react'
import Papa from 'papaparse'
import { useUploadStore } from '@/stores/upload-store'

export function CsvDropzone() {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setCsvData = useUploadStore((s) => s.setCsvData)

  const handleFile = useCallback(
    (file: File) => {
      setError(null)
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setError('Please upload a .csv file.')
        return
      }

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
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 cursor-pointer transition-colors ${
          dragging ? 'border-foreground bg-muted' : 'border-border hover:border-foreground/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="csv-dropzone"
        aria-label="Drop a CSV file here or click to select"
      >
        <span className="text-4xl mb-4" aria-hidden="true">📂</span>
        <p className="font-medium text-sm">Drop your CSV file here</p>
        <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
        <input
          id="csv-file-input"
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          data-testid="csv-file-input"
          aria-label="Select CSV file"
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

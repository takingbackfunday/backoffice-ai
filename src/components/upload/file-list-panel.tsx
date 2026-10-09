'use client'

import { useUploadStore } from '@/stores/upload-store'
import { useState } from 'react'
import { CsvDropzone } from './csv-dropzone'
import { OriginalFileDialog } from './original-file-dialog'

export function FileListPanel({ importing, onRemoveLastFile }: { importing: boolean; onRemoveLastFile?: () => void }) {
  const files = useUploadStore((state) => state.files)
  const removeFile = useUploadStore((state) => state.removeFile)
  const [viewing, setViewing] = useState<string | null>(null)
  const selected = files.find((file) => file.filename === viewing)

  return (
    <div className="space-y-1">
      <div className="space-y-1">
        {files.map((file) => (
          <div key={file.filename} className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <p className="truncate" title={file.filename}>{file.filename}</p>
              {file.original && <button type="button" onClick={() => setViewing(file.filename)} className="text-muted-foreground underline hover:text-foreground" aria-label={`View original file ${file.filename}`}>View original file</button>}
            </div>
            {!importing && (
              <button type="button" onClick={() => {
                if (files.length === 1 && onRemoveLastFile) onRemoveLastFile()
                else removeFile(file.filename)
              }}
                className="shrink-0 text-muted-foreground hover:text-red-600" aria-label={`Remove ${file.filename}`}>
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <CsvDropzone compact />
      {selected?.original && <OriginalFileDialog original={selected.original} onClose={() => setViewing(null)} />}
    </div>
  )
}

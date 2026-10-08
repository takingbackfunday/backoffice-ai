'use client'

import { useUploadStore } from '@/stores/upload-store'
import { CsvDropzone } from './csv-dropzone'

export function FileListPanel({ importing }: { importing: boolean }) {
  const files = useUploadStore((state) => state.files)
  const removeFile = useUploadStore((state) => state.removeFile)

  return (
    <div className="space-y-1">
      <div className="space-y-1">
        {files.map((file) => (
          <div key={file.filename} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{file.filename}</span>
            {!importing && (
              <button type="button" onClick={() => removeFile(file.filename)}
                className="shrink-0 text-muted-foreground hover:text-red-600" aria-label={`Remove ${file.filename}`}>
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <CsvDropzone compact />
    </div>
  )
}

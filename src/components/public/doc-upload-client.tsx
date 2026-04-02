'use client'

import { useEffect, useState } from 'react'
import { useUploadThing } from '@/lib/uploadthing-client'
import { docTypeLabel } from '@/lib/doc-types'

interface DocMeta {
  documentId: string
  fileType: string
  requestLabel: string | null
  applicantName: string
}

export function DocUploadClient({ token }: { token: string }) {
  const [meta, setMeta] = useState<DocMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/public/docs?token=${token}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) setError(j.error)
        else setMeta(j.data)
      })
      .catch(() => setError('Failed to load document request'))
  }, [token])

  const { startUpload } = useUploadThing('adHocDocUploader')

  async function handleUpload() {
    if (!file || !meta) return
    setUploading(true)
    setError(null)
    try {
      const res = await startUpload([file])
      if (!res?.[0]) { setError('Upload failed — please try again'); return }
      const { url } = res[0] as { url: string }

      const saveRes = await fetch('/api/public/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fileUrl: url, fileName: file.name, fileSize: file.size }),
      })
      const saveJson = await saveRes.json()
      if (!saveRes.ok || saveJson.error) { setError(saveJson.error ?? 'Failed to save'); return }
      setDone(true)
    } finally {
      setUploading(false)
    }
  }

  if (error && !meta) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-3">
          <div className="text-2xl">⚠️</div>
          <h1 className="text-base font-semibold">Link invalid or expired</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-3">
          <div className="text-3xl">✓</div>
          <h1 className="text-base font-semibold">Document uploaded</h1>
          <p className="text-sm text-muted-foreground">
            Your <strong>{docTypeLabel(meta.fileType, meta.requestLabel)}</strong> has been received. You can close this page.
          </p>
        </div>
      </div>
    )
  }

  const label = docTypeLabel(meta.fileType, meta.requestLabel)

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-5">
        <div>
          <h1 className="text-lg font-semibold">Upload document</h1>
          <p className="text-sm text-muted-foreground mt-1">Hi {meta.applicantName} — please upload your <strong>{label}</strong>.</p>
        </div>

        <div className="rounded-xl border-2 border-dashed p-6 text-center space-y-3">
          {file ? (
            <div className="space-y-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              <button type="button" onClick={() => setFile(null)} className="text-xs text-muted-foreground hover:text-destructive underline">Remove</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">PDF only, max 10MB</p>
              <label className="cursor-pointer inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                Choose file
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.type !== 'application/pdf') { setError('Only PDF files are accepted'); return }
                    if (f.size > 10 * 1024 * 1024) { setError('File must be under 10MB'); return }
                    setError(null)
                    setFile(f)
                  }}
                />
              </label>
            </>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Uploading…' : 'Submit document'}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useState, useRef } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { useUploadThing } from '@/lib/uploadthing-client'

interface Props {
  initialLogoUrl?: string
  onChange?: (url: string | null) => void
}

export function LogoUpload({ initialLogoUrl, onChange }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { startUpload } = useUploadThing('logoImage')

  function update(url: string | null) {
    setLogoUrl(url)
    onChange?.(url)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const uploaded = await startUpload([file])
      if (!uploaded?.[0]?.url) {
        setError('Upload failed')
        return
      }
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: uploaded[0].url }),
      })
      if (!res.ok) {
        setError('Upload succeeded, but failed to save logo')
        return
      }
      update(uploaded[0].url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove() {
    setError(null)
    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: null }),
      })
      if (!res.ok) {
        setError('Failed to remove logo')
        return
      }
      update(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove logo')
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Logo</label>
      {logoUrl ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Business logo"
            className="h-14 max-w-[140px] object-contain rounded border bg-white p-1"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs hover:bg-muted/50 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload logo'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleFileSelect}
        className="hidden"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

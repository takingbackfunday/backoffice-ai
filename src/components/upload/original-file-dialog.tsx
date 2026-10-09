'use client'

import { useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { readOriginalFile, readOriginalSheet, type OriginalFilePreview } from '@/lib/original-file-preview'
import type { UploadFile } from '@/types'

export function OriginalFileDialog({ original, onClose }: { original: NonNullable<UploadFile['original']>; onClose: () => void }) {
  const filename = original.kind === 'local' ? original.file.name : original.filename
  const bankUrl = original.kind === 'bank'
    ? `/api/bank-import/sessions/${encodeURIComponent(original.sessionId)}/artifacts/${encodeURIComponent(original.artifactId)}`
    : null
  const [preview, setPreview] = useState<OriginalFilePreview | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [sheet, setSheet] = useState<Awaited<ReturnType<typeof readOriginalSheet>> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    let objectUrl: string | null = null
    setPreview(null)
    setDownloadUrl(null)
    setError(null)
    void (async () => {
      try {
        let blob: Blob
        if (original.kind === 'local') blob = original.file
        else {
          const response = await fetch(bankUrl!, { signal: controller.signal, cache: 'no-store' })
          if (!response.ok) throw new Error('The original bank file is unavailable or expired.')
          blob = await response.blob()
        }
        if (cancelled) return
        // Source bytes are downloadable, but never served as executable HTML.
        const mime = original.kind === 'bank' ? original.mimeType : original.file.type
        const pdf = filename.toLowerCase().endsWith('.pdf') || mime.split(';')[0].trim().toLowerCase() === 'application/pdf'
        const downloadBlob = new Blob([blob], { type: pdf ? 'application/pdf' : 'application/octet-stream' })
        objectUrl = URL.createObjectURL(downloadBlob)
        setDownloadUrl(objectUrl)
        const next = await readOriginalFile(blob, filename, mime)
        if (cancelled) return
        setPreview(next)
        if (next.kind === 'excel') {
          const preferred = original.kind === 'local' ? original.sheetName : undefined
          setSheetName(preferred && next.workbook.SheetNames.includes(preferred) ? preferred :
            next.workbook.SheetNames.find((name) => next.workbook.Sheets[name]?.['!ref']) ?? next.workbook.SheetNames[0])
        }
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Could not preview the original file. Download it instead.')
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [original, bankUrl, filename])

  useEffect(() => {
    let cancelled = false
    setSheet(null)
    if (preview?.kind === 'excel') {
      void readOriginalSheet(preview.workbook, sheetName).then((next) => {
        if (!cancelled) setSheet(next)
      }).catch(() => {
        if (!cancelled) setError('Could not preview this sheet. Download the original workbook instead.')
      })
    }
    return () => { cancelled = true }
  }, [preview, sheetName])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Original file</DialogTitle>
          <DialogDescription className="break-all">{filename}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Source content before transaction parsing or column mapping. The download preserves the original file.</p>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {!preview && !error && <p className="text-sm text-muted-foreground" role="status">Loading original file...</p>}
        {preview?.kind === 'text' && (
          <>
            <pre className="min-h-48 max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-4 text-xs">{preview.text || '(Empty file)'}</pre>
            {preview.truncated && <p className="text-xs text-muted-foreground">Showing the first 200,000 characters. Download the original to see the entire file.</p>}
          </>
        )}
        {preview?.kind === 'pdf' && downloadUrl && (
          <iframe src={downloadUrl} title={`Original PDF: ${filename}`} className="h-[60vh] min-h-64 w-full rounded-md border border-border" referrerPolicy="no-referrer" />
        )}
        {preview?.kind === 'excel' && (
          <>
            <label className="flex items-center gap-2 text-sm">
              Sheet
              <select value={sheetName} onChange={(event) => setSheetName(event.target.value)} className="min-w-0 rounded-md border border-border bg-background px-2 py-1">
                {preview.workbook.SheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <tbody>
                  {sheet?.rows.map((row, index) => (
                    <tr key={index} className="border-b border-border">
                      <th scope="row" className="bg-muted/50 px-3 py-2 text-muted-foreground">{sheet.startRow + index}</th>
                      {row.map((value, column) => <td key={column} className="whitespace-pre-wrap border-l border-border px-3 py-2">{value}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {sheet?.rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">This sheet is empty.</p>}
            </div>
            <p className="text-xs text-muted-foreground">Read-only cell contents, not workbook layout or charts.{sheet?.truncated ? ' Showing up to 200 rows and 50 columns; download for the full workbook.' : ''}</p>
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {(downloadUrl || bankUrl) && <a href={downloadUrl ?? bankUrl!} download={filename} className={buttonVariants()}>Download original</a>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

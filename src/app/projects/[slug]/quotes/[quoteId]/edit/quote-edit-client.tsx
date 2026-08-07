'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Download, X, Loader2 } from 'lucide-react'
import { QuoteEditor } from '@/components/projects/quote-editor'

interface InitialData {
  id?: string
  quoteNumber?: string
  title: string
  currency: string
  notes: string | null
  terms: string | null
  validUntil: string | null
  status?: string
  sections: {
    id: string
    name: string
    items: {
      id: string
      description: string
      quantity: number
      unit: string | null
      unitPrice: number
      costRate: number | null
      tags: string[]
      internalNotes: string | null
      riskLevel: string | null
      priceManual: boolean
      isOptional: boolean
    }[]
  }[]
}

interface Props {
  initialData: InitialData
  marginRules: { tag: string; marginPct: number }[]
  projectId: string
  projectSlug: string
  clientName?: string
  jobName?: string
}

export function QuoteEditClient({ initialData, marginRules, projectId, projectSlug, clientName, jobName }: Props) {
  const router = useRouter()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/projects/${projectId}/quotes/${initialData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to save')
    router.refresh()
  }, [projectId, initialData.id, router])

  const handleSaveAndDownload = useCallback(async (payload: Record<string, unknown>) => {
    setSaving(true)
    setError(null)
    try {
      // 1. Save
      const res = await fetch(`/api/projects/${projectId}/quotes/${initialData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')

      // 2. Fetch PDF preview
      setPreviewLoading(true)
      const pdfRes = await fetch(`/api/projects/${projectId}/quotes/${initialData.id}/pdf`)
      if (!pdfRes.ok) throw new Error('Failed to generate preview')
      const blob = await pdfRes.blob()
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
      setPreviewLoading(false)
    }
  }, [projectId, initialData.id, router])

  function handleConfirmDownload() {
    const a = document.createElement('a')
    a.href = `/api/projects/${projectId}/quotes/${initialData.id}/pdf`
    a.download = `${initialData.quoteNumber ?? 'quote'}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    router.push(`/projects/${projectSlug}/quotes/${initialData.id}?downloaded=1`)
  }

  function handleClosePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }

  return (
    <>
      <QuoteEditor
        initialData={initialData}
        marginRules={marginRules}
        projectSlug={projectSlug}
        clientName={clientName}
        jobName={jobName}
        onSave={handleSave}
        onSaveAndDownload={handleSaveAndDownload}
      />

      {/* Error banner */}
      {error && (
        <div className="mt-4 text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      {/* Saving overlay */}
      {saving && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-3 shadow-lg border">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Saving quote…</span>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleClosePreview}
        >
          <div
            className="relative bg-white rounded-xl shadow-2xl overflow-hidden"
            style={{ width: 'min(90vw, 860px)', height: 'min(92vh, 1100px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <span className="text-sm font-semibold">Quote preview — {initialData.quoteNumber ?? 'Quote'}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmDownload}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
            {/* PDF iframe */}
            {previewLoading ? (
              <div className="flex items-center justify-center" style={{ height: 'calc(100% - 45px)' }}>
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <iframe
                src={previewUrl}
                className="w-full"
                style={{ height: 'calc(100% - 45px)', border: 'none' }}
                title="Quote preview"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}

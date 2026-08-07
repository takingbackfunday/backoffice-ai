'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
    // 1. Save
    const res = await fetch(`/api/projects/${projectId}/quotes/${initialData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to save')

    // 2. Trigger download
    const a = document.createElement('a')
    a.href = `/api/projects/${projectId}/quotes/${initialData.id}/pdf`
    a.download = `${initialData.quoteNumber ?? 'quote'}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // 3. Navigate to detail with banner flag
    router.push(`/projects/${projectSlug}/quotes/${initialData.id}?downloaded=1`)
  }, [projectId, initialData.id, initialData.quoteNumber, projectSlug, router])

  return (
    <QuoteEditor
      initialData={initialData}
      marginRules={marginRules}
      projectSlug={projectSlug}
      clientName={clientName}
      jobName={jobName}
      onSave={handleSave}
      onSaveAndDownload={handleSaveAndDownload}
    />
  )
}

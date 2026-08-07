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

  const handleSaveAndSend = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/projects/${projectId}/quotes/${initialData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to save')

    const sendRes = await fetch(`/api/projects/${projectId}/quotes/${initialData.id}/send`, {
      method: 'POST',
    })
    const sendJson = await sendRes.json()
    if (!sendRes.ok) throw new Error(sendJson.error ?? 'Failed to send')
    router.refresh()
  }, [projectId, initialData.id, router])

  return (
    <QuoteEditor
      initialData={initialData}
      marginRules={marginRules}
      projectSlug={projectSlug}
      clientName={clientName}
      jobName={jobName}
      onSave={handleSave}
      onSaveAndSend={handleSaveAndSend}
    />
  )
}

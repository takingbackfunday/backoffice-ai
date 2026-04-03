'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TenantList } from './tenant-list'
import { ApplicantPipeline } from './applicant-pipeline'
import { ApplicantDetail } from './applicant-detail'

interface UnitOption { id: string; unitLabel: string }
interface ListingOption { id: string; title: string; publicSlug: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tenant = any

interface Props {
  projectId: string
  projectSlug: string
  tenants: Tenant[]
  units: UnitOption[]
  listings: ListingOption[]
  defaultTab: 'applicants' | 'tenants'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Applicant = any

export function TenantsApplicantsClient({ projectId, projectSlug, tenants, units, listings, defaultTab }: Props) {
  const [tab, setTab] = useState<'applicants' | 'tenants'>(defaultTab)
  const [tabLoading, setTabLoading] = useState(false)
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null)
  const [loadingApplicant, setLoadingApplicant] = useState(false)

  async function handleSelectApplicant(applicant: Applicant) {
    setLoadingApplicant(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}`)
      if (res.ok) {
        const json = await res.json()
        setSelectedApplicant(json.data)
      } else {
        setSelectedApplicant(applicant)
      }
    } catch {
      setSelectedApplicant(applicant)
    } finally {
      setLoadingApplicant(false)
    }
  }

  return (
    <>
      {/* Tab switcher */}
      <div className="flex gap-0 border-b mb-6">
        {(['applicants', 'tenants'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { if (tab !== t) { setTabLoading(true); setTab(t); setTimeout(() => setTabLoading(false), 300) } }}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px capitalize',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
            )}
          >
            {tabLoading && tab === t ? <span className="inline-block w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" /> : t}
          </button>
        ))}
      </div>

      {tab === 'applicants' && (
        <ApplicantPipeline
          projectId={projectId}
          projectSlug={projectSlug}
          units={units}
          onSelectApplicant={handleSelectApplicant}
        />
      )}

      {tab === 'tenants' && (
        <TenantList
          projectId={projectId}
          tenants={tenants}
        />
      )}

      {loadingApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-background border shadow-lg px-5 py-3 text-sm text-muted-foreground">Loading…</div>
        </div>
      )}

      {selectedApplicant && (
        <ApplicantDetail
          projectId={projectId}
          applicant={selectedApplicant}
          units={units}
          listings={listings}
          onClose={() => setSelectedApplicant(null)}
          onUpdated={updated => setSelectedApplicant(updated)}
        />
      )}
    </>
  )
}

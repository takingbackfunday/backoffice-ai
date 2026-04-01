'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TenantList } from './tenant-list'
import { ApplicantPipeline } from './applicant-pipeline'
import { ApplicantDetail } from './applicant-detail'

interface UnitOption { id: string; unitLabel: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tenant = any

interface Props {
  projectId: string
  tenants: Tenant[]
  units: UnitOption[]
  defaultTab: 'applicants' | 'tenants'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Applicant = any

export function TenantsApplicantsClient({ projectId, tenants, units, defaultTab }: Props) {
  const [tab, setTab] = useState<'applicants' | 'tenants'>(defaultTab)
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null)

  return (
    <>
      {/* Tab switcher */}
      <div className="flex gap-0 border-b mb-6">
        {(['applicants', 'tenants'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px capitalize',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'applicants' && (
        <ApplicantPipeline
          projectId={projectId}
          units={units}
          onSelectApplicant={setSelectedApplicant}
        />
      )}

      {tab === 'tenants' && (
        <TenantList
          projectId={projectId}
          tenants={tenants}
        />
      )}

      {selectedApplicant && (
        <ApplicantDetail
          projectId={projectId}
          applicant={selectedApplicant}
          units={units}
          onClose={() => setSelectedApplicant(null)}
          onUpdated={updated => setSelectedApplicant(updated)}
        />
      )}
    </>
  )
}

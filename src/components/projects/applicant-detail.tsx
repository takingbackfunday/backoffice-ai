'use client'

import React, { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  'INQUIRY', 'APPLICATION_SENT', 'APPLIED', 'SCREENING',
  'APPROVED', 'LEASE_OFFERED', 'LEASE_SIGNED', 'REJECTED', 'WITHDRAWN',
]

const STATUS_LABELS: Record<string, string> = {
  INQUIRY: 'Inquiry', APPLICATION_SENT: 'App Sent', APPLIED: 'Applied',
  SCREENING: 'Screening', APPROVED: 'Approved', LEASE_OFFERED: 'Lease Offered',
  LEASE_SIGNED: 'Lease Signed', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn',
}

const STATUS_COLORS: Record<string, string> = {
  INQUIRY: 'bg-slate-100 text-slate-700',
  APPLICATION_SENT: 'bg-blue-100 text-blue-700',
  APPLIED: 'bg-indigo-100 text-indigo-700',
  SCREENING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  LEASE_OFFERED: 'bg-teal-100 text-teal-700',
  LEASE_SIGNED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  WITHDRAWN: 'bg-gray-100 text-gray-500',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppData = Record<string, any>

interface Applicant {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  source: string | null
  desiredMoveIn: string | null
  desiredRent: number | null
  currentEmployer: string | null
  annualIncome: number | null
  notes: string | null
  creditScore: number | null
  backgroundCheck: string | null
  rejectedReason: string | null
  screeningConsentAt: string | null
  applicationData: AppData | null
  unit: { id: string; unitLabel: string } | null
  listing: { id: string; publicSlug: string; title: string } | null
  convertedToTenant: { id: string; name: string } | null
}

interface UnitOption { id: string; unitLabel: string }

interface Props {
  projectId: string
  applicant: Applicant
  units: UnitOption[]
  onClose: () => void
  onUpdated: (applicant: Applicant) => void
}

function AppSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function AppRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

export function ApplicantDetail({ projectId, applicant: initial, units, onClose, onUpdated }: Props) {
  const [applicant, setApplicant] = useState<Applicant>(initial)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [sendingApp, setSendingApp] = useState(false)
  const [sendAppSuccess, setSendAppSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [rejectedReason, setRejectedReason] = useState(initial.rejectedReason ?? '')

  async function save(updates: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Save failed'); return }
      const updated = { ...applicant, ...json.data }
      setApplicant(updated)
      onUpdated(updated)
    } finally {
      setSaving(false)
    }
  }

  async function handleConvert() {
    setConverting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}/convert`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Conversion failed'); return }
      setApplicant(prev => ({ ...prev, convertedToTenant: json.data }))
      onUpdated({ ...applicant, convertedToTenant: json.data })
    } finally {
      setConverting(false)
    }
  }

  async function handleSendApplication() {
    setSendingApp(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}/send-application`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send'); return }
      setSendAppSuccess(true)
      if (json.data?.status && json.data.status !== applicant.status) {
        const updated = { ...applicant, status: json.data.status }
        setApplicant(updated)
        onUpdated(updated)
      }
    } finally {
      setSendingApp(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-sm">{applicant.name}</h2>
            <p className="text-xs text-muted-foreground">{applicant.email}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
          )}

          {/* DEBUG — remove after testing */}
          <pre className="text-[10px] bg-muted rounded p-2 overflow-auto max-h-40">
            applicationData: {JSON.stringify(applicant.applicationData, null, 2) ?? 'null'}{'\n'}
            listing: {JSON.stringify(applicant.listing) ?? 'null'}{'\n'}
            status: {applicant.status}
          </pre>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium mb-1.5">Status</label>
            <div className="flex items-center gap-2">
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[applicant.status] ?? 'bg-muted')}>
                {STATUS_LABELS[applicant.status] ?? applicant.status}
              </span>
              <select
                value={applicant.status}
                onChange={e => {
                  const newStatus = e.target.value
                  if (newStatus === 'REJECTED' && !rejectedReason) return
                  save({ status: newStatus, ...(newStatus === 'REJECTED' ? { rejectedReason: rejectedReason || 'No reason given' } : {}) })
                }}
                className="text-xs rounded-md border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>

          {/* Send Application */}
          {(applicant.status === 'INQUIRY' || applicant.status === 'APPLICATION_SENT') && !applicant.applicationData && applicant.listing && (
            <div className="rounded-lg border border-dashed p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">Send application link</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Email them a link to the full rental application form.</p>
              </div>
              {sendAppSuccess ? (
                <span className="text-xs text-emerald-600 font-medium flex-shrink-0">Sent ✓</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendApplication}
                  disabled={sendingApp}
                  className="flex-shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {sendingApp ? 'Sending…' : 'Send'}
                </button>
              )}
            </div>
          )}

          {/* Unit */}
          <div>
            <label className="block text-xs font-medium mb-1">Unit</label>
            <select
              value={applicant.unit?.id ?? ''}
              onChange={e => save({ unitId: e.target.value || null })}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— no unit assigned —</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.unitLabel}</option>)}
            </select>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm">{applicant.phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="text-sm">{applicant.source ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Desired move-in</p>
              <p className="text-sm">{applicant.desiredMoveIn ? new Date(applicant.desiredMoveIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Desired rent</p>
              <p className="text-sm">{applicant.desiredRent ? `$${Number(applicant.desiredRent).toLocaleString()}/mo` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Employer</p>
              <p className="text-sm">{applicant.currentEmployer ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Annual income</p>
              <p className="text-sm">{applicant.annualIncome ? `$${Number(applicant.annualIncome).toLocaleString()}` : '—'}</p>
            </div>
          </div>

          {/* Application data */}
          {applicant.applicationData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Application</p>
                {applicant.screeningConsentAt && (
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    Consent ✓ {new Date(applicant.screeningConsentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Personal */}
              {applicant.applicationData.personal && (
                <AppSection label="Personal">
                  <AppRow label="Address" value={applicant.applicationData.personal.currentAddress} />
                  <AppRow label="Date of birth" value={applicant.applicationData.personal.dateOfBirth} />
                </AppSection>
              )}

              {/* Employment */}
              {applicant.applicationData.employment && (
                <AppSection label="Employment">
                  <AppRow label="Employer" value={applicant.applicationData.employment.currentEmployer} />
                  <AppRow label="Position" value={applicant.applicationData.employment.position} />
                  <AppRow label="Annual income" value={applicant.applicationData.employment.annualIncome ? `$${Number(applicant.applicationData.employment.annualIncome).toLocaleString()}` : null} />
                  <AppRow label="Duration" value={applicant.applicationData.employment.employmentDuration} />
                </AppSection>
              )}

              {/* Rental history */}
              {applicant.applicationData.rentalHistory && (
                <AppSection label="Rental history">
                  <AppRow label="Previous landlord" value={applicant.applicationData.rentalHistory.previousLandlordName} />
                  <AppRow label="Landlord phone" value={applicant.applicationData.rentalHistory.previousLandlordPhone} />
                  <AppRow label="Previous address" value={applicant.applicationData.rentalHistory.previousAddress} />
                  <AppRow label="Duration" value={applicant.applicationData.rentalHistory.durationAtAddress} />
                  <AppRow label="Reason for leaving" value={applicant.applicationData.rentalHistory.reasonForLeaving} />
                </AppSection>
              )}

              {/* Additional */}
              {applicant.applicationData.additional && (
                <AppSection label="Additional">
                  <AppRow label="Occupants" value={applicant.applicationData.additional.numberOfOccupants} />
                  <AppRow label="Lease term" value={applicant.applicationData.additional.desiredLeaseTerm} />
                  <AppRow label="Vehicles" value={applicant.applicationData.additional.vehicles} />
                  {applicant.applicationData.additional.pets && (
                    <AppRow
                      label="Pets"
                      value={[
                        applicant.applicationData.additional.pets.type,
                        applicant.applicationData.additional.pets.breed,
                        applicant.applicationData.additional.pets.weight ? `${applicant.applicationData.additional.pets.weight} lbs` : null,
                      ].filter(Boolean).join(', ')}
                    />
                  )}
                </AppSection>
              )}
            </div>
          )}

          {/* Screening */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Credit score</p>
              <p className="text-sm">{applicant.creditScore ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Background check</p>
              <p className={cn('text-sm capitalize', applicant.backgroundCheck === 'passed' && 'text-emerald-600', applicant.backgroundCheck === 'failed' && 'text-red-600')}>
                {applicant.backgroundCheck ?? '—'}
              </p>
            </div>
          </div>

          {/* Rejection reason */}
          {applicant.status === 'REJECTED' && (
            <div>
              <label className="block text-xs font-medium mb-1">Rejection reason</label>
              <input
                type="text"
                value={rejectedReason}
                onChange={e => setRejectedReason(e.target.value)}
                onBlur={() => { if (rejectedReason !== applicant.rejectedReason) save({ rejectedReason }) }}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => { if (notes !== applicant.notes) save({ notes }) }}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Any notes about this applicant…"
            />
          </div>

          {/* Converted */}
          {applicant.convertedToTenant && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Converted to tenant: <span className="font-medium">{applicant.convertedToTenant.name}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {(applicant.status === 'APPROVED' || applicant.status === 'LEASE_SIGNED') && !applicant.convertedToTenant && (
          <div className="border-t px-5 py-4">
            <button
              type="button"
              onClick={handleConvert}
              disabled={converting || saving}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {converting ? 'Converting…' : 'Convert to Tenant →'}
            </button>
          </div>
        )}

        {saving && (
          <div className="absolute bottom-4 right-5 text-xs text-muted-foreground">Saving…</div>
        )}
      </div>
    </div>
  )
}

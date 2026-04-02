'use client'

import React, { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DOC_TYPES, docTypeLabel } from '@/lib/doc-types'

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
  invoices?: Array<{
    id: string
    invoiceNumber: string
    status: string
    dueDate: string
    sentAt: string | null
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>
  }>
  documents?: Array<{
    id: string
    fileType: string
    requestLabel: string | null
    status: string
    fileUrl: string | null
    fileName: string | null
    createdAt: string
  }>
}

interface UnitOption { id: string; unitLabel: string }
interface ListingOption { id: string; title: string; publicSlug: string }

interface Props {
  projectId: string
  applicant: Applicant
  units: UnitOption[]
  listings?: ListingOption[]
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

export function ApplicantDetail({ projectId, applicant: initial, units, listings = [], onClose, onUpdated }: Props) {
  const [applicant, setApplicant] = useState<Applicant>(initial)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [conflictTenant, setConflictTenant] = useState<{ id: string; name: string; email: string } | null>(null)
  const [sendingApp, setSendingApp] = useState(false)
  const [sendAppSuccess, setSendAppSuccess] = useState(false)
  const [selectedListingId, setSelectedListingId] = useState(() =>
    initial.listing?.id ?? (listings.length === 1 ? listings[0].id : '')
  )
  const [sendingInvoice, setSendingInvoice] = useState(false)
  const [invoiceSent, setInvoiceSent] = useState(false)
  const [feeInvoice, setFeeInvoice] = useState(initial.invoices?.[0] ?? null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [rejectedReason, setRejectedReason] = useState(initial.rejectedReason ?? '')
  const [showCreditInput, setShowCreditInput] = useState(false)
  const [creditScoreValue, setCreditScoreValue] = useState<string>(initial.creditScore?.toString() ?? '')
  const [showBgCheckInput, setShowBgCheckInput] = useState(false)
  const [bgCheckValue, setBgCheckValue] = useState<string>(initial.backgroundCheck ?? '')
  const [showLeaseForm, setShowLeaseForm] = useState(false)
  const hasPet = !!(initial.applicationData?.additional?.pets)
  const [leaseForm, setLeaseForm] = useState({
    startDate: '',
    endDate: '',
    monthlyRent: '',
    securityDeposit: '',
    paymentDueDay: '1',
    lateFeeAmount: '',
    lateFeeGraceDays: '5',
    additionalCharges: hasPet
      ? [{ label: 'Pet Fee', amount: '', frequency: 'monthly' as 'monthly' | 'one_time' }]
      : [] as { label: string; amount: string; frequency: 'monthly' | 'one_time' }[],
    utilitiesIncluded: [] as string[],
    petsAllowed: hasPet,
    petNotes: '',
    smokingAllowed: false,
    sublettingAllowed: false,
    parkingStall: '',
    parkingFee: '',
    storageUnit: '',
    storageFee: '',
    guestPolicy: '',
    contractNotes: '',
  })
  const [offeringLease, setOfferingLease] = useState(false)
  const [documents, setDocuments] = useState(initial.documents ?? [])
  const [showRequestDocs, setShowRequestDocs] = useState(false)
  const [requestDocTypes, setRequestDocTypes] = useState<string[]>([])
  const [requestOtherLabel, setRequestOtherLabel] = useState('')
  const [requestingDocs, setRequestingDocs] = useState(false)
  const [requestDocsError, setRequestDocsError] = useState<string | null>(null)
  const [requestDocsSent, setRequestDocsSent] = useState(false)

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

  async function handleConvert(linkToTenantId?: string) {
    setConverting(true)
    setError(null)
    setConflictTenant(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkToTenantId ? { linkToTenantId } : {}),
      })
      const json = await res.json()
      if (res.status === 409 && json.existingTenant) {
        setConflictTenant(json.existingTenant)
        return
      }
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
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}/send-application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedListingId ? { listingId: selectedListingId } : {}),
      })
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

  async function handleSendInvoice() {
    setSendingInvoice(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}/send-invoice`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send invoice'); return }
      setInvoiceSent(true)
      setFeeInvoice(json.data)
    } finally {
      setSendingInvoice(false)
    }
  }

  async function handleSaveCreditScore() {
    const score = parseInt(creditScoreValue, 10)
    if (isNaN(score) || score < 300 || score > 850) return
    await save({ creditScore: score })
    setShowCreditInput(false)
  }

  async function handleSaveBgCheck(value: string) {
    await save({ backgroundCheck: value })
    setBgCheckValue(value)
    setShowBgCheckInput(false)
  }

  async function handleOfferLease() {
    if (!leaseForm.startDate || !leaseForm.endDate || !leaseForm.monthlyRent) return
    setOfferingLease(true)
    setError(null)
    try {
      const validCharges = leaseForm.additionalCharges
        .filter(c => c.label.trim() && c.amount !== '')
        .map(c => ({ label: c.label.trim(), amount: parseFloat(c.amount), frequency: c.frequency }))

      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}/offer-lease`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: leaseForm.startDate,
          endDate: leaseForm.endDate,
          monthlyRent: parseFloat(leaseForm.monthlyRent),
          securityDeposit: leaseForm.securityDeposit ? parseFloat(leaseForm.securityDeposit) : undefined,
          paymentDueDay: parseInt(leaseForm.paymentDueDay, 10),
          lateFeeAmount: leaseForm.lateFeeAmount ? parseFloat(leaseForm.lateFeeAmount) : undefined,
          lateFeeGraceDays: parseInt(leaseForm.lateFeeGraceDays, 10),
          contractNotes: leaseForm.contractNotes || undefined,
          additionalCharges: validCharges,
          utilitiesIncluded: leaseForm.utilitiesIncluded,
          leaseRules: {
            petsAllowed: leaseForm.petsAllowed,
            petNotes: leaseForm.petNotes || undefined,
            smokingAllowed: leaseForm.smokingAllowed,
            sublettingAllowed: leaseForm.sublettingAllowed,
            parkingStall: leaseForm.parkingStall || undefined,
            parkingFee: leaseForm.parkingFee ? parseFloat(leaseForm.parkingFee) : undefined,
            storageUnit: leaseForm.storageUnit || undefined,
            storageFee: leaseForm.storageFee ? parseFloat(leaseForm.storageFee) : undefined,
            guestPolicy: leaseForm.guestPolicy || undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send lease'); return }
      const updated = { ...applicant, status: 'LEASE_OFFERED' }
      setApplicant(updated)
      onUpdated(updated)
      setShowLeaseForm(false)
    } finally {
      setOfferingLease(false)
    }
  }

  async function handleRequestDocs() {
    if (requestDocTypes.length === 0) return
    if (requestDocTypes.includes('other') && !requestOtherLabel.trim()) {
      setRequestDocsError('Please specify a label for "Other"')
      return
    }
    setRequestingDocs(true)
    setRequestDocsError(null)
    try {
      const requests = requestDocTypes.map(fileType => ({
        fileType,
        ...(fileType === 'other' ? { requestLabel: requestOtherLabel.trim() } : {}),
      }))
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}/request-docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setRequestDocsError(json.error ?? 'Failed to send request'); return }
      // Refresh documents list
      const freshRes = await fetch(`/api/projects/${projectId}/applicants/${applicant.id}`)
      if (freshRes.ok) {
        const freshJson = await freshRes.json()
        setDocuments(freshJson.data?.documents ?? [])
      }
      setRequestDocsSent(true)
      setTimeout(() => {
        setShowRequestDocs(false)
        setRequestDocsSent(false)
        setRequestDocTypes([])
        setRequestOtherLabel('')
      }, 1500)
    } finally {
      setRequestingDocs(false)
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

          {/* Screening input buttons */}
          {!['REJECTED', 'WITHDRAWN'].includes(applicant.status) && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCreditInput(true)}
                className={cn(
                  'flex-1 rounded-lg border-2 border-dashed px-3 py-2.5 text-xs font-semibold transition-colors',
                  applicant.creditScore
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary'
                )}
              >
                {applicant.creditScore ? `Credit: ${applicant.creditScore}` : '+ Input Credit Score'}
              </button>
              <button
                type="button"
                onClick={() => setShowBgCheckInput(true)}
                className={cn(
                  'flex-1 rounded-lg border-2 border-dashed px-3 py-2.5 text-xs font-semibold transition-colors',
                  applicant.backgroundCheck
                    ? applicant.backgroundCheck === 'passed'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : applicant.backgroundCheck === 'failed'
                        ? 'border-red-300 bg-red-50 text-red-700'
                        : 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary'
                )}
              >
                {applicant.backgroundCheck ? `BG: ${applicant.backgroundCheck}` : '+ Input Background Check'}
              </button>
            </div>
          )}

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
          {(applicant.status === 'INQUIRY' || applicant.status === 'APPLICATION_SENT') && !applicant.applicationData && (applicant.listing || listings.length > 0) && (
            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
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
                    disabled={sendingApp || (!applicant.listing && !selectedListingId)}
                    className="flex-shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {sendingApp ? 'Sending…' : 'Send'}
                  </button>
                )}
              </div>
              {!applicant.listing && listings.length > 1 && (
                <select
                  value={selectedListingId}
                  onChange={e => setSelectedListingId(e.target.value)}
                  className="w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select a listing…</option>
                  {listings.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Application fee invoice */}
          {feeInvoice && (() => {
            const total = feeInvoice.lineItems.reduce((s, li) => s + Number(li.unitPrice) * Number(li.quantity), 0)
            const isPaid = feeInvoice.status === 'PAID'
            const isSent = feeInvoice.status === 'SENT' || feeInvoice.sentAt
            return (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Application Invoice</p>
                  <span className={cn('text-[10px] rounded-full px-2 py-0.5 font-medium',
                    isPaid ? 'bg-emerald-100 text-emerald-700' :
                    isSent ? 'bg-blue-100 text-blue-700' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {isPaid ? 'Paid' : isSent ? 'Sent' : 'Draft'}
                  </span>
                </div>
                <div className="space-y-1">
                  {feeInvoice.lineItems.map((li, i) => (
                    <div key={i} className="flex justify-between text-xs text-muted-foreground">
                      <span>{li.description}</span>
                      <span>${Number(li.unitPrice).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                    <span>Total</span>
                    <span>${total.toLocaleString()}</span>
                  </div>
                </div>
                {!isPaid && (
                  invoiceSent || isSent ? (
                    <p className="text-[11px] text-muted-foreground">
                      Sent to {applicant.email}{feeInvoice.sentAt ? ` on ${new Date(feeInvoice.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendInvoice}
                      disabled={sendingInvoice}
                      className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {sendingInvoice ? 'Sending…' : 'Send Invoice'}
                    </button>
                  )
                )}
              </div>
            )
          })()}

          {/* Unit */}
          <div>
            <label className="block text-xs font-medium mb-1">Unit</label>
            {units.length === 1 && !applicant.unit ? (
              <p className="text-sm text-muted-foreground">
                {units[0].unitLabel}
                <button
                  type="button"
                  onClick={() => save({ unitId: units[0].id })}
                  className="ml-2 text-xs text-primary hover:underline"
                >
                  Assign
                </button>
              </p>
            ) : (
              <select
                value={applicant.unit?.id ?? ''}
                onChange={e => save({ unitId: e.target.value || null })}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— no unit assigned —</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.unitLabel}</option>)}
              </select>
            )}
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

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
              <button
                type="button"
                onClick={() => { setShowRequestDocs(true); setRequestDocsSent(false); setRequestDocsError(null) }}
                className="text-xs text-primary hover:underline"
              >
                + Request docs
              </button>
            </div>
            {documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{docTypeLabel(doc.fileType, doc.requestLabel)}</p>
                      {doc.fileName && <p className="text-[10px] text-muted-foreground truncate">{doc.fileName}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className={cn(
                        'text-[10px] rounded-full px-2 py-0.5 font-medium',
                        doc.status === 'uploaded' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {doc.status === 'uploaded' ? 'Uploaded' : 'Requested'}
                      </span>
                      {doc.fileUrl && doc.status === 'uploaded' && (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline"
                        >
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
        {applicant.status === 'APPROVED' && !applicant.convertedToTenant && (
          <div className="border-t">
            {!showLeaseForm ? (
              <div className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowLeaseForm(true)}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  Draft Lease Agreement →
                </button>
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-5">
                <h3 className="text-xs font-semibold">Lease Agreement</h3>

                {/* Section 1 — Lease term */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Lease Term</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Start date *</label>
                      <input type="date" value={leaseForm.startDate} onChange={e => setLeaseForm(f => ({ ...f, startDate: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">End date *</label>
                      <input type="date" value={leaseForm.endDate} onChange={e => setLeaseForm(f => ({ ...f, endDate: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Monthly rent ($) *</label>
                      <input type="number" min="0" value={leaseForm.monthlyRent} onChange={e => setLeaseForm(f => ({ ...f, monthlyRent: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Security deposit ($)</label>
                      <input type="number" min="0" value={leaseForm.securityDeposit} onChange={e => setLeaseForm(f => ({ ...f, securityDeposit: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Payment due day</label>
                      <input type="number" min="1" max="31" value={leaseForm.paymentDueDay} onChange={e => setLeaseForm(f => ({ ...f, paymentDueDay: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" />
                    </div>
                  </div>
                </div>

                {/* Section 2 — Late fees */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Late Fees</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Late fee ($)</label>
                      <input type="number" min="0" value={leaseForm.lateFeeAmount} onChange={e => setLeaseForm(f => ({ ...f, lateFeeAmount: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" placeholder="e.g. 50" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Grace period (days)</label>
                      <input type="number" min="0" value={leaseForm.lateFeeGraceDays} onChange={e => setLeaseForm(f => ({ ...f, lateFeeGraceDays: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" />
                    </div>
                  </div>
                </div>

                {/* Section 3 — Additional charges */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Additional Charges</p>
                  {leaseForm.additionalCharges.map((charge, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Label (e.g. Pet Fee)"
                        value={charge.label}
                        onChange={e => setLeaseForm(f => {
                          const next = [...f.additionalCharges]
                          next[i] = { ...next[i], label: e.target.value }
                          return { ...f, additionalCharges: next }
                        })}
                        className="flex-1 rounded-md border px-2 py-1.5 text-xs min-w-0"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="$"
                        value={charge.amount}
                        onChange={e => setLeaseForm(f => {
                          const next = [...f.additionalCharges]
                          next[i] = { ...next[i], amount: e.target.value }
                          return { ...f, additionalCharges: next }
                        })}
                        className="w-20 rounded-md border px-2 py-1.5 text-xs"
                      />
                      <select
                        value={charge.frequency}
                        onChange={e => setLeaseForm(f => {
                          const next = [...f.additionalCharges]
                          next[i] = { ...next[i], frequency: e.target.value as 'monthly' | 'one_time' }
                          return { ...f, additionalCharges: next }
                        })}
                        className="rounded-md border px-1.5 py-1.5 text-xs"
                      >
                        <option value="monthly">/mo</option>
                        <option value="one_time">once</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setLeaseForm(f => ({ ...f, additionalCharges: f.additionalCharges.filter((_, j) => j !== i) }))}
                        className="text-muted-foreground hover:text-destructive text-xs px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLeaseForm(f => ({ ...f, additionalCharges: [...f.additionalCharges, { label: '', amount: '', frequency: 'monthly' }] }))}
                    className="text-xs text-primary hover:underline"
                  >
                    + Add charge
                  </button>
                  {leaseForm.additionalCharges.filter(c => c.frequency === 'monthly' && c.amount).length > 0 && leaseForm.monthlyRent && (
                    <p className="text-[10px] text-muted-foreground">
                      Total monthly: ${(
                        parseFloat(leaseForm.monthlyRent || '0') +
                        leaseForm.additionalCharges
                          .filter(c => c.frequency === 'monthly' && c.amount)
                          .reduce((s, c) => s + parseFloat(c.amount || '0'), 0)
                      ).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Section 4 — Utilities */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Utilities Included in Rent</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {['Water', 'Heat', 'Electricity', 'Gas', 'Internet', 'Garbage'].map(util => (
                      <label key={util} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={leaseForm.utilitiesIncluded.includes(util)}
                          onChange={e => setLeaseForm(f => ({
                            ...f,
                            utilitiesIncluded: e.target.checked
                              ? [...f.utilitiesIncluded, util]
                              : f.utilitiesIncluded.filter(u => u !== util),
                          }))}
                          className="h-3.5 w-3.5 rounded border"
                        />
                        <span className="text-xs">{util}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Section 5 — Parking & Storage */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Parking &amp; Storage</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Parking stall</label>
                      <input type="text" value={leaseForm.parkingStall} onChange={e => setLeaseForm(f => ({ ...f, parkingStall: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" placeholder="e.g. #12" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Parking fee/mo ($)</label>
                      <input type="number" min="0" value={leaseForm.parkingFee} onChange={e => setLeaseForm(f => ({ ...f, parkingFee: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Storage unit</label>
                      <input type="text" value={leaseForm.storageUnit} onChange={e => setLeaseForm(f => ({ ...f, storageUnit: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" placeholder="e.g. B-04" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Storage fee/mo ($)</label>
                      <input type="number" min="0" value={leaseForm.storageFee} onChange={e => setLeaseForm(f => ({ ...f, storageFee: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" />
                    </div>
                  </div>
                </div>

                {/* Section 6 — Rules & Policies */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rules &amp; Policies</p>
                  <div className="space-y-2">
                    {[
                      { key: 'petsAllowed', label: 'Pets allowed' },
                      { key: 'smokingAllowed', label: 'Smoking allowed' },
                      { key: 'sublettingAllowed', label: 'Subletting allowed' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={leaseForm[key as keyof typeof leaseForm] as boolean}
                          onChange={e => setLeaseForm(f => ({ ...f, [key]: e.target.checked }))}
                          className="h-3.5 w-3.5 rounded border"
                        />
                        <span className="text-xs">{label}</span>
                      </label>
                    ))}
                    {leaseForm.petsAllowed && (
                      <div>
                        <label className="block text-[10px] font-medium mb-0.5">Pet notes (breed restrictions, deposit details…)</label>
                        <input type="text" value={leaseForm.petNotes} onChange={e => setLeaseForm(f => ({ ...f, petNotes: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" placeholder="e.g. Max 2 pets, under 50 lbs" />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-medium mb-0.5">Guest policy</label>
                      <input type="text" value={leaseForm.guestPolicy} onChange={e => setLeaseForm(f => ({ ...f, guestPolicy: e.target.value }))} className="w-full rounded-md border px-2 py-1.5 text-xs" placeholder="e.g. Guests may not stay more than 14 consecutive days" />
                    </div>
                  </div>
                </div>

                {/* Additional clauses */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-medium">Additional clauses / addendum</label>
                  <textarea value={leaseForm.contractNotes} onChange={e => setLeaseForm(f => ({ ...f, contractNotes: e.target.value }))} rows={3} className="w-full rounded-md border px-2 py-1.5 text-xs resize-none" placeholder="Any additional terms…" />
                </div>

                <div className="flex gap-2 pb-1">
                  <button type="button" onClick={() => setShowLeaseForm(false)} className="flex-1 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted">Cancel</button>
                  <button
                    type="button"
                    onClick={handleOfferLease}
                    disabled={offeringLease || !leaseForm.startDate || !leaseForm.endDate || !leaseForm.monthlyRent}
                    className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {offeringLease ? 'Sending…' : 'Send Lease Offer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {applicant.status === 'LEASE_SIGNED' && !applicant.convertedToTenant && (
          <div className="border-t px-5 py-4">
            <button
              type="button"
              onClick={() => handleConvert()}
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

        {/* Email conflict reconciliation modal */}
        {conflictTenant && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-background border shadow-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold">Tenant already exists</h3>
              <p className="text-xs text-muted-foreground">
                A tenant named <span className="font-semibold text-foreground">{conflictTenant.name}</span> already exists with <span className="font-mono">{conflictTenant.email}</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                This applicant (<span className="font-semibold text-foreground">{applicant.name}</span>) appears to be the same person. Do you want to link this application to that existing tenant, or keep them separate?
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setConflictTenant(null); handleConvert(conflictTenant.id) }}
                  disabled={converting}
                  className="w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Link to "{conflictTenant.name}" (same person)
                </button>
                <button
                  type="button"
                  onClick={() => setConflictTenant(null)}
                  className="w-full rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  Cancel — fix email first
                </button>
              </div>
            </div>
          </div>
        )}

        {showCreditInput && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-xs rounded-xl bg-background border shadow-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold">Input Credit Score</h3>
              <input
                type="number"
                min={300}
                max={850}
                value={creditScoreValue}
                onChange={e => setCreditScoreValue(e.target.value)}
                placeholder="e.g. 720"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">Valid range: 300–850</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreditInput(false)} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">Cancel</button>
                <button type="button" onClick={handleSaveCreditScore} disabled={saving} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {showBgCheckInput && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-xs rounded-xl bg-background border shadow-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold">Background Check Result</h3>
              <div className="flex flex-col gap-2">
                {(['passed', 'failed', 'pending'] as const).map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleSaveBgCheck(val)}
                    disabled={saving}
                    className={cn(
                      'w-full rounded-md border px-3 py-2.5 text-sm font-medium transition-colors capitalize',
                      val === 'passed' && 'hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700',
                      val === 'failed' && 'hover:bg-red-50 hover:border-red-300 hover:text-red-700',
                      val === 'pending' && 'hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700',
                      bgCheckValue === val && (
                        val === 'passed' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
                        val === 'failed' ? 'bg-red-50 border-red-300 text-red-700' :
                        'bg-amber-50 border-amber-300 text-amber-700'
                      )
                    )}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => setShowBgCheckInput(false)} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Request Documents modal */}
        {showRequestDocs && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-background border shadow-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold">Request documents</h3>
              <p className="text-xs text-muted-foreground">Select documents to request from {applicant.name}. An email with secure upload links will be sent to {applicant.email}.</p>
              {requestDocsSent ? (
                <p className="text-sm text-emerald-600 font-medium text-center py-2">Request sent ✓</p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {DOC_TYPES.map(doc => (
                      <label key={doc.key} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requestDocTypes.includes(doc.key)}
                          onChange={e => setRequestDocTypes(prev =>
                            e.target.checked ? [...prev, doc.key] : prev.filter(d => d !== doc.key)
                          )}
                          className="h-3.5 w-3.5 rounded border"
                        />
                        <span className="text-sm">{doc.label}</span>
                      </label>
                    ))}
                  </div>
                  {requestDocTypes.includes('other') && (
                    <input
                      type="text"
                      value={requestOtherLabel}
                      onChange={e => setRequestOtherLabel(e.target.value)}
                      placeholder='e.g. "Pet deposit waiver"'
                      className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  )}
                  {requestDocsError && <p className="text-xs text-destructive">{requestDocsError}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => { setShowRequestDocs(false); setRequestDocTypes([]); setRequestOtherLabel(''); setRequestDocsError(null) }}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestDocs}
                      disabled={requestingDocs || requestDocTypes.length === 0}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {requestingDocs ? 'Sending…' : 'Send request'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

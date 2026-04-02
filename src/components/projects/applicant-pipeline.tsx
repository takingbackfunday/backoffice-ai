'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const STATUSES = [
  'INQUIRY',
  'APPLICATION_SENT',
  'APPLIED',
  'SCREENING',
  'APPROVED',
  'LEASE_OFFERED',
  'LEASE_SIGNED',
  'REJECTED',
  'WITHDRAWN',
] as const

const STATUS_LABELS: Record<string, string> = {
  INQUIRY: 'Inquiry',
  APPLICATION_SENT: 'App Sent',
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  APPROVED: 'Approved',
  LEASE_OFFERED: 'Lease Offered',
  LEASE_SIGNED: 'Lease Signed',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
}

const STATUS_COLORS: Record<string, string> = {
  INQUIRY: 'bg-slate-100 text-slate-700 border-slate-200',
  APPLICATION_SENT: 'bg-blue-50 text-blue-700 border-blue-200',
  APPLIED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SCREENING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LEASE_OFFERED: 'bg-teal-50 text-teal-700 border-teal-200',
  LEASE_SIGNED: 'bg-green-50 text-green-700 border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  WITHDRAWN: 'bg-gray-50 text-gray-500 border-gray-200',
}

interface Applicant {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  source: string | null
  creditScore: number | null
  backgroundCheck: string | null
  createdAt: string
  unit: { id: string; unitLabel: string } | null
  _count: { documents: number }
  convertedToTenant: { id: string } | null
  leases?: Array<{ id: string; contractStatus: string; tenantSignedAt: string | null }>
}

interface UnitOption { id: string; unitLabel: string }

interface Props {
  projectId: string
  units?: UnitOption[]
  onSelectApplicant?: (applicant: Applicant) => void
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export function ApplicantPipeline({ projectId, units = [], onSelectApplicant }: Props) {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ applicantId: string; toStatus: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [converting, setConverting] = useState<string | null>(null)
  const [countersignModal, setCountersignModal] = useState<{ applicantId: string; leaseId: string } | null>(null)
  const [countersignName, setCountersignName] = useState('')
  const [countersignError, setCountersignError] = useState<string | null>(null)
  const [countersigning, setCountersigning] = useState(false)
  const [moveInLoading, setMoveInLoading] = useState<string | null>(null)
  const [moveInDone, setMoveInDone] = useState<Set<string>>(new Set())
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState(() => ({ name: '', email: '', phone: '', unitId: units.length === 1 ? units[0].id : '', source: '', notes: '' }))
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants`)
      if (res.ok) {
        const json = await res.json()
        setApplicants(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(applicantId: string, status: string, extra?: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/applicants/${applicantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extra }),
    })
    if (res.ok) {
      const json = await res.json()
      setApplicants(prev => prev.map(a => a.id === applicantId ? { ...a, ...json.data } : a))
    }
  }

  async function handleConvert(applicantId: string) {
    setConverting(applicantId)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants/${applicantId}/convert`, { method: 'POST' })
      if (res.ok) await load()
    } finally {
      setConverting(null)
    }
  }

  async function handleCountersign() {
    if (!countersignModal || !countersignName.trim()) {
      setCountersignError('Please type your name.')
      return
    }
    setCountersigning(true)
    setCountersignError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/leases/${countersignModal.leaseId}/countersign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureName: countersignName.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setCountersignError(json.error ?? 'Failed to countersign'); return }
      // Advance applicant to LEASE_SIGNED
      await updateStatus(countersignModal.applicantId, 'LEASE_SIGNED')
      setCountersignModal(null)
      setCountersignName('')
    } finally {
      setCountersigning(false)
    }
  }

  async function handleMoveInInvoice(applicantId: string, leaseId: string) {
    setMoveInLoading(applicantId)
    try {
      const res = await fetch(`/api/projects/${projectId}/leases/${leaseId}/generate-move-in`, { method: 'POST' })
      if (res.ok) {
        setMoveInDone(prev => new Set([...prev, applicantId]))
      }
    } finally {
      setMoveInLoading(null)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAdding(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/applicants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          email: addForm.email,
          phone: addForm.phone || undefined,
          unitId: addForm.unitId || undefined,
          source: addForm.source || undefined,
          notes: addForm.notes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAddError(json.error ?? 'Failed to add applicant')
        return
      }
      await load()
      setShowAddModal(false)
      setAddForm({ name: '', email: '', phone: '', unitId: units.length === 1 ? units[0].id : '', source: '', notes: '' })
    } catch {
      setAddError('Network error. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  function handleDrop(e: React.DragEvent, toStatus: string) {
    e.preventDefault()
    if (!draggingId) return
    if (toStatus === 'REJECTED') {
      setRejectModal({ applicantId: draggingId, toStatus })
      setDraggingId(null)
      return
    }
    updateStatus(draggingId, toStatus)
    setDraggingId(null)
  }

  async function confirmReject() {
    if (!rejectModal) return
    await updateStatus(rejectModal.applicantId, 'REJECTED', { rejectedReason: rejectReason || 'No reason given' })
    setRejectModal(null)
    setRejectReason('')
  }

  const byStatus = STATUSES.reduce<Record<string, Applicant[]>>((acc, s) => {
    acc[s] = applicants.filter(a => a.status === s)
    return acc
  }, {} as Record<string, Applicant[]>)

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading applicants…</p>

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">Applicant Pipeline</h2>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Add Applicant
        </button>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {STATUSES.map(status => (
            <div
              key={status}
              className="w-52 flex flex-col"
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, status)}
            >
              {/* Column header */}
              <div className={cn('rounded-t-lg border px-3 py-2 flex items-center justify-between', STATUS_COLORS[status])}>
                <span className="text-xs font-semibold">{STATUS_LABELS[status]}</span>
                <span className="text-xs opacity-70">{byStatus[status].length}</span>
              </div>

              {/* Cards */}
              <div className="flex-1 min-h-24 border border-t-0 rounded-b-lg bg-background p-1.5 space-y-1.5">
                {byStatus[status].map(applicant => (
                  <div
                    key={applicant.id}
                    draggable
                    onDragStart={() => setDraggingId(applicant.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className={cn(
                      'rounded-md border bg-card px-3 py-2 text-sm cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow',
                      draggingId === applicant.id && 'opacity-50'
                    )}
                    onClick={() => onSelectApplicant?.(applicant)}
                  >
                    <p className="font-medium text-xs truncate">{applicant.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{applicant.email}</p>
                    {applicant.unit && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Unit: {applicant.unit.unitLabel}</p>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-muted-foreground">{daysSince(applicant.createdAt)}d ago</span>
                      <div className="flex items-center gap-1.5">
                        {applicant.source && (
                          <span className="text-[9px] bg-muted px-1 py-0.5 rounded">{applicant.source}</span>
                        )}
                        {applicant._count.documents > 0 && (
                          <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded">{applicant._count.documents} doc{applicant._count.documents !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    {/* Stage-specific action buttons */}
                    {status === 'INQUIRY' && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onSelectApplicant?.(applicant) }}
                        className="mt-1.5 w-full rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 transition-colors"
                      >
                        Send Application →
                      </button>
                    )}
                    {status === 'APPLICATION_SENT' && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onSelectApplicant?.(applicant) }}
                        className="mt-1.5 w-full rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
                      >
                        Resend Application
                      </button>
                    )}
                    {(status === 'APPLIED' || status === 'SCREENING') && (
                      <div className="flex gap-1 mt-1.5">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onSelectApplicant?.(applicant) }}
                          className={cn(
                            'flex-1 rounded px-1.5 py-0.5 text-[9px] font-medium border transition-colors',
                            applicant.creditScore
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary'
                          )}
                        >
                          {applicant.creditScore ? `Credit: ${applicant.creditScore}` : '+ Credit'}
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onSelectApplicant?.(applicant) }}
                          className={cn(
                            'flex-1 rounded px-1.5 py-0.5 text-[9px] font-medium border transition-colors',
                            applicant.backgroundCheck
                              ? applicant.backgroundCheck === 'passed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : applicant.backgroundCheck === 'failed' ? 'bg-red-50 border-red-200 text-red-700'
                                : 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary'
                          )}
                        >
                          {applicant.backgroundCheck ? `BG: ${applicant.backgroundCheck}` : '+ BG Check'}
                        </button>
                      </div>
                    )}
                    {status === 'SCREENING' && (
                      <div className="flex gap-1 mt-1">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); updateStatus(applicant.id, 'APPROVED') }}
                          className="flex-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-emerald-700 transition-colors"
                        >
                          Approve ✓
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            setRejectModal({ applicantId: applicant.id, toStatus: 'REJECTED' })
                          }}
                          className="flex-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-red-700 transition-colors"
                        >
                          Reject ✗
                        </button>
                      </div>
                    )}
                    {status === 'APPROVED' && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onSelectApplicant?.(applicant) }}
                        className="mt-1.5 w-full rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 transition-colors"
                      >
                        Draft Lease Agreement →
                      </button>
                    )}
                    {status === 'LEASE_OFFERED' && (() => {
                      const lease = applicant.leases?.[0]
                      const tenantSigned = lease?.contractStatus === 'SIGNED' && lease?.tenantSignedAt
                      if (tenantSigned) {
                        return (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setCountersignModal({ applicantId: applicant.id, leaseId: lease!.id })
                              setCountersignName('')
                              setCountersignError(null)
                            }}
                            className="mt-1.5 w-full rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700 transition-colors"
                          >
                            ✍ Countersign →
                          </button>
                        )
                      }
                      return (
                        <div className="mt-1.5 w-full rounded bg-teal-50 border border-teal-200 px-2 py-1 text-[10px] text-teal-700 text-center font-medium">
                          ⏳ Awaiting signature
                        </div>
                      )
                    })()}
                    {status === 'LEASE_SIGNED' && (() => {
                      const lease = applicant.leases?.[0]
                      const alreadySent = moveInDone.has(applicant.id)
                      return (
                        <div className="mt-1.5 space-y-1">
                          {!applicant.convertedToTenant ? (
                            <button
                              type="button"
                              disabled={converting === applicant.id}
                              onClick={e => { e.stopPropagation(); handleConvert(applicant.id) }}
                              className="w-full rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                              {converting === applicant.id ? 'Converting…' : 'Convert to Tenant →'}
                            </button>
                          ) : (
                            <div className="w-full rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] text-emerald-700 text-center font-medium">
                              ✓ Converted
                            </div>
                          )}
                          {lease && (
                            alreadySent ? (
                              <div className="w-full rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground text-center">
                                Move-in invoice sent ✓
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={moveInLoading === applicant.id}
                                onClick={e => { e.stopPropagation(); handleMoveInInvoice(applicant.id, lease.id) }}
                                className="w-full rounded border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                              >
                                {moveInLoading === applicant.id ? 'Sending…' : 'Send Move-in Invoice'}
                              </button>
                            )
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reject reason modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-background border shadow-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold">Reject applicant</h3>
            <div>
              <label className="block text-xs font-medium mb-1">Reason <span className="text-destructive">*</span></label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Credit score too low, income requirements not met…"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setRejectModal(null); setRejectReason('') }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={!rejectReason.trim()}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add applicant modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-background border shadow-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold">Add applicant</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Name <span className="text-destructive">*</span></label>
                <input
                  required
                  type="text"
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email <span className="text-destructive">*</span></label>
                <input
                  required
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {units.length > 0 && (
                <div>
                  <label className="block text-xs font-medium mb-1">Unit</label>
                  <select
                    value={addForm.unitId}
                    onChange={e => setAddForm(f => ({ ...f, unitId: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">No unit assigned</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.unitLabel}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1">Source</label>
                <input
                  type="text"
                  value={addForm.source}
                  onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="zillow, referral, walk-in…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <textarea
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {addError && <p className="text-sm text-destructive">{addError}</p>}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddError(null); setAddForm({ name: '', email: '', phone: '', unitId: units.length === 1 ? units[0].id : '', source: '', notes: '' }) }}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {adding ? 'Adding…' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Countersign modal */}
      {countersignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-background border shadow-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold">Countersign lease</h3>
            <p className="text-xs text-muted-foreground">The tenant has signed. Type your name below to countersign and activate the lease.</p>
            <div>
              <label className="block text-xs font-medium mb-1">Your signature (type your full name) <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={countersignName}
                onChange={e => setCountersignName(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Your full name"
                style={{ fontFamily: "'Brush Script MT', cursive" }}
                autoFocus
              />
            </div>
            {countersignError && <p className="text-sm text-destructive">{countersignError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setCountersignModal(null)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
              <button
                type="button"
                onClick={handleCountersign}
                disabled={countersigning || !countersignName.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {countersigning ? 'Signing…' : 'Countersign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

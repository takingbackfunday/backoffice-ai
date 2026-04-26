'use client'

import { useState, useEffect } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Workspace { id: string; name: string; type: string; slug: string }
interface Job { id: string; name: string; status: string }
interface MaintenanceRequest { id: string; title: string; status: string }
interface Vendor { id: string; name: string; specialty: string | null }

interface Props {
  onClose: () => void
  onCreated?: () => void
  defaultType?: 'CLIENT' | 'PROPERTY'
}

export function NewWorkOrderModal({ onClose, onCreated, defaultType }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [selectedWsId, setSelectedWsId] = useState('')

  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [newWsType, setNewWsType] = useState<'CLIENT' | 'PROPERTY'>(defaultType ?? 'CLIENT')
  const [newWsAddress, setNewWsAddress] = useState('')
  const [savingWs, setSavingWs] = useState(false)

  const [jobs, setJobs] = useState<Job[]>([])
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([])
  const [loadingContext, setLoadingContext] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedMaintenanceId, setSelectedMaintenanceId] = useState('')

  const [creatingJob, setCreatingJob] = useState(false)
  const [newJobName, setNewJobName] = useState('')
  const [savingJob, setSavingJob] = useState(false)

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [form, setForm] = useState({ title: '', description: '', vendorId: '', agreedCost: '', scheduledDate: '' })
  const [creatingVendor, setCreatingVendor] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorSpecialty, setNewVendorSpecialty] = useState('')
  const [savingVendor, setSavingVendor] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = defaultType ? `/api/projects?type=${defaultType}` : '/api/projects'
    fetch(url)
      .then(r => r.json())
      .then(j => setWorkspaces(j.data ?? []))
      .finally(() => setLoadingWorkspaces(false))
  }, [defaultType])

  async function createWorkspace() {
    const type = defaultType ?? newWsType
    if (!newWsName.trim()) return
    if (type === 'PROPERTY' && !newWsAddress.trim()) return
    setSavingWs(true)
    try {
      const body: Record<string, unknown> = { name: newWsName.trim(), type }
      if (type === 'PROPERTY') body.property = { address: newWsAddress.trim() }
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) {
        const j = await r.json()
        const ws = j.data as Workspace
        setWorkspaces(prev => [...prev, ws])
        setCreatingWorkspace(false)
        setNewWsName('')
        setNewWsAddress('')
        setSelectedWsId(ws.id)
        selectWorkspace(ws)
      }
    } finally {
      setSavingWs(false)
    }
  }

  async function selectWorkspace(ws: Workspace) {
    setSelectedWorkspace(ws)
    setSelectedWsId(ws.id)
    setLoadingContext(true)
    try {
      if (ws.type === 'CLIENT') {
        const r = await fetch(`/api/projects/${ws.id}/jobs`)
        const j = await r.json()
        setJobs(j.data ?? [])
      } else if (ws.type === 'PROPERTY') {
        const r = await fetch(`/api/projects/${ws.id}/maintenance`)
        const j = await r.json()
        setMaintenanceRequests(j.data ?? [])
      }
    } finally {
      setLoadingContext(false)
    }
    setStep(2)
  }

  async function createJob() {
    if (!newJobName.trim() || !selectedWorkspace) return
    setSavingJob(true)
    try {
      const r = await fetch(`/api/projects/${selectedWorkspace.id}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newJobName.trim() }),
      })
      if (r.ok) {
        const j = await r.json()
        const job = j.data as Job
        setJobs(prev => [...prev, job])
        setSelectedJobId(job.id)
        setCreatingJob(false)
        setNewJobName('')
        goToStep3()
      }
    } finally {
      setSavingJob(false)
    }
  }

  async function goToStep3() {
    const r = await fetch('/api/vendors')
    const j = await r.json()
    setVendors(j.data ?? [])
    setStep(3)
  }

  async function createVendor() {
    if (!newVendorName.trim()) return
    setSavingVendor(true)
    try {
      const r = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newVendorName.trim(), specialty: newVendorSpecialty || undefined }),
      })
      if (r.ok) {
        const j = await r.json()
        setVendors(prev => [...prev, j.data])
        setForm(p => ({ ...p, vendorId: j.data.id }))
        setCreatingVendor(false)
        setNewVendorName('')
        setNewVendorSpecialty('')
      }
    } finally {
      setSavingVendor(false)
    }
  }

  async function submit() {
    if (!selectedWorkspace || !form.title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/projects/${selectedWorkspace.id}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          vendorId: form.vendorId || undefined,
          agreedCost: form.agreedCost ? Number(form.agreedCost) : undefined,
          scheduledDate: form.scheduledDate || undefined,
          ...(selectedWorkspace.type === 'CLIENT' && selectedJobId ? { jobId: selectedJobId } : {}),
          ...(selectedWorkspace.type === 'PROPERTY' && selectedMaintenanceId ? { maintenanceRequestId: selectedMaintenanceId } : {}),
        }),
      })
      if (r.ok) {
        onCreated?.()
        onClose()
      } else {
        const j = await r.json()
        setError(j.error ?? 'Failed to create work order')
      }
    } finally {
      setSaving(false)
    }
  }

  const stepLabels = selectedWorkspace?.type === 'CLIENT'
    ? ['Project', 'Job', 'Details']
    : ['Property', 'Request', 'Details']

  const needsAddress = (defaultType === 'PROPERTY') || (!defaultType && newWsType === 'PROPERTY')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg border shadow-lg w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-sm font-semibold">New sub-contract work order</h2>
            <div className="flex items-center gap-1 mt-1">
              {[1, 2, 3].map(n => (
                <span key={n} className={cn('text-xs', n === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {stepLabels[n - 1] ?? n}{n < 3 && <ChevronRight className="inline w-3 h-3 mx-0.5" />}
                </span>
              ))}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Step 1: Pick workspace */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {defaultType === 'CLIENT' ? 'Which client project is this for?' : defaultType === 'PROPERTY' ? 'Which property is this for?' : 'Which project is this for?'}
              </p>
              {loadingWorkspaces ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : creatingWorkspace ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={newWsName}
                    onChange={e => setNewWsName(e.target.value)}
                    placeholder={defaultType === 'PROPERTY' ? 'Property name *' : 'Project name *'}
                    className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                  {!defaultType && (
                    <select
                      value={newWsType}
                      onChange={e => setNewWsType(e.target.value as 'CLIENT' | 'PROPERTY')}
                      className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                    >
                      <option value="CLIENT">Client project</option>
                      <option value="PROPERTY">Property</option>
                    </select>
                  )}
                  {needsAddress && (
                    <input
                      value={newWsAddress}
                      onChange={e => setNewWsAddress(e.target.value)}
                      placeholder="Property address *"
                      className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={createWorkspace}
                      disabled={savingWs || !newWsName.trim() || (needsAddress && !newWsAddress.trim())}
                      className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {savingWs ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCreatingWorkspace(false); setNewWsName(''); setNewWsAddress('') }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  value={selectedWsId}
                  onChange={e => {
                    if (e.target.value === '__new__') { setCreatingWorkspace(true); return }
                    if (e.target.value) {
                      const ws = workspaces.find(w => w.id === e.target.value)
                      if (ws) selectWorkspace(ws)
                    }
                  }}
                  className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                >
                  <option value="" disabled>Select a project…</option>
                  {workspaces.map(ws => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}{!defaultType ? ` (${ws.type === 'CLIENT' ? 'Client' : 'Property'})` : ''}
                    </option>
                  ))}
                  <option value="__new__">
                    {defaultType === 'CLIENT' ? '+ New client project…' : defaultType === 'PROPERTY' ? '+ New property…' : '+ New project…'}
                  </option>
                </select>
              )}
            </div>
          )}

          {/* Step 2: Pick context (job or maintenance request) */}
          {step === 2 && selectedWorkspace && (
            <div className="space-y-3">
              {loadingContext ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : selectedWorkspace.type === 'CLIENT' ? (
                <>
                  <p className="text-xs text-muted-foreground">Which job is this for? (optional)</p>
                  {creatingJob ? (
                    <div className="space-y-2">
                      <input
                        autoFocus
                        value={newJobName}
                        onChange={e => setNewJobName(e.target.value)}
                        placeholder="Job name *"
                        className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={createJob}
                          disabled={savingJob || !newJobName.trim()}
                          className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                        >
                          {savingJob ? 'Creating…' : 'Create'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setCreatingJob(false); setNewJobName('') }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <select
                      defaultValue=""
                      onChange={e => {
                        if (e.target.value === '__new__') { setCreatingJob(true); return }
                        if (e.target.value === '__none__') { setSelectedJobId(''); goToStep3(); return }
                        if (e.target.value) { setSelectedJobId(e.target.value); goToStep3() }
                      }}
                      className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                    >
                      <option value="" disabled>Select a job…</option>
                      <option value="__none__">— No specific job —</option>
                      {jobs.map(job => (
                        <option key={job.id} value={job.id}>{job.name} ({job.status})</option>
                      ))}
                      <option value="__new__">+ New job…</option>
                    </select>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Which maintenance request is this for? (optional)</p>
                  <select
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value === '__none__') { setSelectedMaintenanceId(''); goToStep3(); return }
                      if (e.target.value) { setSelectedMaintenanceId(e.target.value); goToStep3() }
                    }}
                    className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                  >
                    <option value="" disabled>Select a request…</option>
                    <option value="__none__">— No specific request —</option>
                    {maintenanceRequests.map(mr => (
                      <option key={mr.id} value={mr.id}>{mr.title} ({mr.status})</option>
                    ))}
                  </select>
                </>
              )}
              {!creatingJob && (
                <button type="button" onClick={() => setStep(1)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
              )}
            </div>
          )}

          {/* Step 3: Work order details */}
          {step === 3 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Title *</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Plumbing repair, Sound mixing…"
                  className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Vendor</label>
                  {creatingVendor ? (
                    <div className="mt-0.5 space-y-1">
                      <input
                        autoFocus
                        value={newVendorName}
                        onChange={e => setNewVendorName(e.target.value)}
                        placeholder="Vendor name *"
                        className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                      />
                      <input
                        value={newVendorSpecialty}
                        onChange={e => setNewVendorSpecialty(e.target.value)}
                        placeholder="Specialty (optional)"
                        className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                      />
                      <div className="flex gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={createVendor}
                          disabled={savingVendor || !newVendorName.trim()}
                          className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                        >
                          {savingVendor ? 'Creating…' : 'Create'}
                        </button>
                        <button type="button" onClick={() => { setCreatingVendor(false); setNewVendorName(''); setNewVendorSpecialty('') }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={form.vendorId}
                      onChange={e => {
                        if (e.target.value === '__new__') { setCreatingVendor(true); setForm(p => ({ ...p, vendorId: '' })) }
                        else { setForm(p => ({ ...p, vendorId: e.target.value })) }
                      }}
                      className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                    >
                      <option value="">— Unassigned —</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}{v.specialty ? ` (${v.specialty})` : ''}</option>
                      ))}
                      <option value="__new__">+ New vendor…</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Agreed cost</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.agreedCost}
                    onChange={e => setForm(p => ({ ...p, agreedCost: e.target.value }))}
                    placeholder="0.00"
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Scheduled date</label>
                  <input
                    type="date"
                    value={form.scheduledDate}
                    onChange={e => setForm(p => ({ ...p, scheduledDate: e.target.value }))}
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setStep(2)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving || !form.title.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create work order'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

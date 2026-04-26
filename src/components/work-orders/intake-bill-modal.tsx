'use client'

import { useState, useEffect } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUploadThing } from '@/lib/uploadthing-client'

interface Workspace { id: string; name: string; type: string }
interface Vendor { id: string; name: string; specialty: string | null }
interface WorkOrder { id: string; title: string; status: string; vendor: { id: string; name: string } | null }

interface Props {
  onClose: () => void
  onCreated?: () => void
}

export function IntakeBillModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [selectedWsId, setSelectedWsId] = useState('')

  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [newWsType, setNewWsType] = useState<'CLIENT' | 'PROPERTY'>('CLIENT')
  const [newWsAddress, setNewWsAddress] = useState('')
  const [savingWs, setSavingWs] = useState(false)

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loadingWOs, setLoadingWOs] = useState(false)
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null)

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [creatingWO, setCreatingWO] = useState(false)
  const [newWOTitle, setNewWOTitle] = useState('')
  const [newWOVendorId, setNewWOVendorId] = useState('')
  const [savingWO, setSavingWO] = useState(false)

  const [creatingVendorForWO, setCreatingVendorForWO] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorSpecialty, setNewVendorSpecialty] = useState('')
  const [savingVendor, setSavingVendor] = useState(false)

  const [form, setForm] = useState({ billNumber: '', amount: '', issueDate: '', dueDate: '', notes: '' })
  const [billFile, setBillFile] = useState<File | null>(null)
  const [uploadingBill, setUploadingBill] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { startUpload } = useUploadThing('billPdf')

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(j => setWorkspaces((j.data ?? []).filter((w: Workspace) => w.type !== 'OTHER')))
      .finally(() => setLoadingWorkspaces(false))
  }, [])

  async function createWorkspace() {
    if (!newWsName.trim()) return
    if (newWsType === 'PROPERTY' && !newWsAddress.trim()) return
    setSavingWs(true)
    try {
      const body: Record<string, unknown> = { name: newWsName.trim(), type: newWsType }
      if (newWsType === 'PROPERTY') body.property = { address: newWsAddress.trim() }
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
        selectWorkspace(ws)
      }
    } finally {
      setSavingWs(false)
    }
  }

  async function selectWorkspace(ws: Workspace) {
    setSelectedWorkspace(ws)
    setSelectedWsId(ws.id)
    setLoadingWOs(true)
    try {
      const r = await fetch(`/api/projects/${ws.id}/work-orders`)
      const j = await r.json()
      setWorkOrders(j.data ?? [])
    } finally {
      setLoadingWOs(false)
    }
    setStep(2)
  }

  async function startCreatingWO() {
    setCreatingWO(true)
    const r = await fetch('/api/vendors')
    const j = await r.json()
    setVendors(j.data ?? [])
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
        setNewWOVendorId(j.data.id)
        setCreatingVendorForWO(false)
        setNewVendorName('')
        setNewVendorSpecialty('')
      }
    } finally {
      setSavingVendor(false)
    }
  }

  async function createWO() {
    if (!newWOTitle.trim() || !selectedWorkspace) return
    setSavingWO(true)
    try {
      const r = await fetch(`/api/projects/${selectedWorkspace.id}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newWOTitle.trim(), vendorId: newWOVendorId || undefined }),
      })
      if (r.ok) {
        const j = await r.json()
        const vendor = newWOVendorId ? (vendors.find(v => v.id === newWOVendorId) ?? null) : null
        const wo: WorkOrder = {
          ...j.data,
          vendor: vendor ? { id: vendor.id, name: vendor.name } : null,
        }
        setWorkOrders(prev => [...prev, wo])
        setSelectedWO(wo)
        setCreatingWO(false)
        setCreatingVendorForWO(false)
        setNewWOTitle('')
        setNewWOVendorId('')
        setStep(3)
      }
    } finally {
      setSavingWO(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedWO || !selectedWorkspace || !form.amount || !form.issueDate || !selectedWO.vendor) return
    setSaving(true)
    setError(null)
    try {
      let fileUrl: string | undefined
      let fileName: string | undefined
      if (billFile) {
        setUploadingBill(true)
        const uploaded = await startUpload([billFile])
        setUploadingBill(false)
        if (uploaded?.[0]) {
          fileUrl = uploaded[0].url
          fileName = billFile.name
        }
      }
      const r = await fetch(`/api/projects/${selectedWorkspace.id}/work-orders/${selectedWO.id}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: selectedWO.vendor.id,
          billNumber: form.billNumber || undefined,
          amount: Number(form.amount),
          issueDate: form.issueDate,
          dueDate: form.dueDate || undefined,
          notes: form.notes || undefined,
          fileUrl,
          fileName,
        }),
      })
      if (r.ok) {
        onCreated?.()
        onClose()
      } else {
        const j = await r.json()
        setError(j.error ?? 'Failed to save bill')
      }
    } finally {
      setSaving(false)
      setUploadingBill(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg border shadow-lg w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-sm font-semibold">Intake subcontractor bill</h2>
            <div className="flex items-center gap-1 mt-1">
              {(['Project', 'Work order', 'Bill details'] as const).map((label, i) => (
                <span key={label} className={cn('text-xs', i + 1 === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {label}{i < 2 && <ChevronRight className="inline w-3 h-3 mx-0.5" />}
                </span>
              ))}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Step 1: Pick workspace */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Which project does this bill belong to?</p>
              {loadingWorkspaces ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : creatingWorkspace ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={newWsName}
                    onChange={e => setNewWsName(e.target.value)}
                    placeholder="Project name *"
                    className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                  <select
                    value={newWsType}
                    onChange={e => setNewWsType(e.target.value as 'CLIENT' | 'PROPERTY')}
                    className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                  >
                    <option value="CLIENT">Client project</option>
                    <option value="PROPERTY">Property</option>
                  </select>
                  {newWsType === 'PROPERTY' && (
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
                      disabled={savingWs || !newWsName.trim() || (newWsType === 'PROPERTY' && !newWsAddress.trim())}
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
                      {ws.name} ({ws.type === 'CLIENT' ? 'Client' : 'Property'})
                    </option>
                  ))}
                  <option value="__new__">+ New project…</option>
                </select>
              )}
            </div>
          )}

          {/* Step 2: Pick work order */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Which work order is this bill for?</p>
              {loadingWOs ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : creatingWO ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={newWOTitle}
                    onChange={e => setNewWOTitle(e.target.value)}
                    placeholder="Work order title *"
                    className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground">Vendor</label>
                    {creatingVendorForWO ? (
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
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={createVendor}
                            disabled={savingVendor || !newVendorName.trim()}
                            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                          >
                            {savingVendor ? 'Creating…' : 'Create'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setCreatingVendorForWO(false); setNewVendorName(''); setNewVendorSpecialty('') }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <select
                        value={newWOVendorId}
                        onChange={e => {
                          if (e.target.value === '__new__') { setCreatingVendorForWO(true); setNewWOVendorId('') }
                          else { setNewWOVendorId(e.target.value) }
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
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={createWO}
                      disabled={savingWO || !newWOTitle.trim()}
                      className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {savingWO ? 'Creating…' : 'Create work order'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCreatingWO(false); setNewWOTitle(''); setNewWOVendorId(''); setCreatingVendorForWO(false) }}
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
                    if (e.target.value === '__new__') { startCreatingWO(); return }
                    if (e.target.value) {
                      const wo = workOrders.find(w => w.id === e.target.value)
                      if (wo) { setSelectedWO(wo); setStep(3) }
                    }
                  }}
                  className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                >
                  <option value="" disabled>Select a work order…</option>
                  {workOrders.map(wo => (
                    <option key={wo.id} value={wo.id}>
                      {wo.title}{wo.vendor ? ` — ${wo.vendor.name}` : ' (no vendor)'}
                    </option>
                  ))}
                  <option value="__new__">+ New work order…</option>
                </select>
              )}
              {!creatingWO && (
                <button type="button" onClick={() => setStep(1)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
              )}
            </div>
          )}

          {/* Step 3: Bill details */}
          {step === 3 && selectedWO && (
            <form onSubmit={submit} className="space-y-3">
              {selectedWO.vendor ? (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Work order: </span><span className="font-medium">{selectedWO.title}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">Vendor: </span><span className="font-medium">{selectedWO.vendor.name}</span>
                </div>
              ) : (
                <p className="text-xs text-orange-600 rounded-md bg-orange-50 px-3 py-2">
                  This work order has no vendor. Please go back and pick a work order with a vendor assigned, or assign one first.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Bill # (optional)</label>
                  <input
                    value={form.billNumber}
                    onChange={e => setForm(p => ({ ...p, billNumber: e.target.value }))}
                    placeholder="INV-001"
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Amount *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Issue date *</label>
                  <input
                    type="date"
                    required
                    value={form.issueDate}
                    onChange={e => setForm(p => ({ ...p, issueDate: e.target.value }))}
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Due date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">PDF (optional)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setBillFile(e.target.files?.[0] ?? null)}
                    className="mt-0.5 w-full text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setStep(2)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                <button
                  type="submit"
                  disabled={saving || uploadingBill || !selectedWO.vendor}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {uploadingBill ? 'Uploading…' : saving ? 'Saving…' : 'Save bill'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

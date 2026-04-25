'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { JobSelect } from '@/components/projects/job-select'

/* ------------------------------------------------------------------ */
/*  NewClientModal                                                      */
/* ------------------------------------------------------------------ */

interface NewClientModalProps {
  onClose: () => void
  onCreated: (client: { id: string; name: string; slug: string }) => void
}

export function NewClientModal({ onClose, onCreated }: NewClientModalProps) {
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: 'CLIENT',
          client: {
            contactName: contactName.trim() || undefined,
            company: company.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to create client'); return }
      onCreated({ id: json.data.id, name: json.data.name, slug: json.data.slug })
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-xl bg-background border shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">New client</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Client / business name <span className="text-destructive">*</span></label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" autoFocus className={field} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Contact name</label>
              <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Smith" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Company</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp Ltd" className={field} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@acme.com" className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" className={field} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City, State" className={field} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  NewJobModal                                                         */
/* ------------------------------------------------------------------ */

interface ClientOption {
  id: string
  name: string
}

interface NewJobModalProps {
  clients: ClientOption[]
  onClose: () => void
  onCreated: (job: { id: string; name: string; projectId: string }) => void
}

export function NewJobModal({ clients: initialClients, onClose, onCreated }: NewJobModalProps) {
  const [clients, setClients] = useState(initialClients)
  const [clientId, setClientId] = useState(initialClients.length === 1 ? initialClients[0].id : '')
  const [jobName, setJobName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inline new-client form state
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [savingClient, setSavingClient] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  function handleClientChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '__new__') {
      setCreatingClient(true)
      setClientId('')
    } else {
      setClientId(val)
    }
  }

  async function handleCreateClient() {
    if (!newClientName.trim()) return
    setSavingClient(true)
    setClientError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName.trim(), type: 'CLIENT', client: {} }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setClientError(json.error ?? 'Failed to create client'); return }
      const created = { id: json.data.id, name: json.data.name }
      setClients(prev => [...prev, created])
      setClientId(created.id)
      setCreatingClient(false)
      setNewClientName('')
    } finally {
      setSavingClient(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!jobName.trim() || !clientId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${clientId}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: jobName.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to create job'); return }
      onCreated({ id: json.data.id, name: json.data.name, projectId: clientId })
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">New job</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Client <span className="text-destructive">*</span></label>
            {!creatingClient ? (
              <select
                required
                value={clientId}
                onChange={handleClientChange}
                autoFocus
                className={inputCls}
              >
                <option value="">Select client…</option>
                <option value="__new__">+ New client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={newClientName}
                    onChange={e => setNewClientName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient() } if (e.key === 'Escape') { setCreatingClient(false); setNewClientName('') } }}
                    placeholder="Client / business name"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={handleCreateClient}
                    disabled={savingClient || !newClientName.trim()}
                    className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {savingClient ? '…' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreatingClient(false); setNewClientName('') }}
                    className="shrink-0 rounded-md border px-2 py-2 text-xs hover:bg-muted transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {clientError && <p className="text-xs text-destructive">{clientError}</p>}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Job name <span className="text-destructive">*</span></label>
            <input
              type="text"
              required
              value={jobName}
              onChange={e => setJobName(e.target.value)}
              placeholder="Brand redesign, Q2 retainer…"
              className={inputCls}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !jobName.trim() || !clientId} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  NewEstimateModal                                                    */
/* ------------------------------------------------------------------ */

interface ClientWithSlug {
  id: string
  name: string
  slug: string
}

interface NewEstimateModalProps {
  clients: ClientWithSlug[]
  onClose: () => void
}

export function NewEstimateModal({ clients, onClose }: NewEstimateModalProps) {
  const router = useRouter()
  const [clientSlug, setClientSlug] = useState(clients.length === 1 ? clients[0].slug : '')

  function handleGo(e: React.FormEvent) {
    e.preventDefault()
    if (!clientSlug) return
    router.push(`/projects/${clientSlug}/estimates/new`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">New estimate</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleGo} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Client <span className="text-destructive">*</span></label>
            <select required value={clientSlug} onChange={e => setClientSlug(e.target.value)} autoFocus
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={!clientSlug} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              Go to estimate →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  NewQuoteModal                                                       */
/* ------------------------------------------------------------------ */

interface NewQuoteModalProps {
  clients: ClientWithSlug[]
  onClose: () => void
}

export function NewQuoteModal({ clients, onClose }: NewQuoteModalProps) {
  const router = useRouter()
  const [clientSlug, setClientSlug] = useState(clients.length === 1 ? clients[0].slug : '')

  function handleGo(e: React.FormEvent) {
    e.preventDefault()
    if (!clientSlug) return
    router.push(`/projects/${clientSlug}/quotes/new`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">New quote</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleGo} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Client <span className="text-destructive">*</span></label>
            <select required value={clientSlug} onChange={e => setClientSlug(e.target.value)} autoFocus
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={!clientSlug} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              Go to quote →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  LogTimeModal                                                        */
/* ------------------------------------------------------------------ */

interface ClientWithJobs extends ClientWithSlug {
  jobs: { id: string; name: string }[]
}

interface LogTimeModalProps {
  clients: ClientWithJobs[]
  onClose: () => void
}

const emptyTimeForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  hours: '',
  minutes: '',
  description: '',
  billable: true,
  rate: '',
  jobId: '',
})

export function LogTimeModal({ clients, onClose }: LogTimeModalProps) {
  const [clientId, setClientId] = useState(clients.length === 1 ? clients[0].id : '')
  const [form, setForm] = useState(emptyTimeForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeClient = clients.find(c => c.id === clientId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const totalMins = (parseInt(form.hours || '0') * 60) + parseInt(form.minutes || '0')
    if (!form.description.trim()) { setError('Description is required'); return }
    if (totalMins < 1) { setError('Enter at least 1 minute'); return }
    if (!clientId) { setError('Select a client'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${clientId}/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          minutes: totalMins,
          description: form.description.trim(),
          billable: form.billable,
          rate: form.rate ? parseFloat(form.rate) : null,
          jobId: form.jobId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-xl bg-background border shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Log time</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Client <span className="text-destructive">*</span></label>
            <select required value={clientId} onChange={e => { setClientId(e.target.value); setForm(f => ({ ...f, jobId: '' })) }} autoFocus className={field}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Date</label>
              <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={field} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Duration</label>
              <div className="flex items-center gap-1">
                <input type="number" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="0" min="0"
                  className="w-full rounded-md border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <span className="text-muted-foreground text-xs shrink-0">h</span>
                <input type="number" value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))} placeholder="0" min="0" max="59"
                  className="w-full rounded-md border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <span className="text-muted-foreground text-xs shrink-0">m</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description <span className="text-destructive">*</span></label>
            <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you work on?" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {activeClient && (
              <div>
                <label className="block text-xs font-medium mb-1">Job <span className="text-muted-foreground font-normal">(optional)</span></label>
                <JobSelect
                  value={form.jobId}
                  onChange={jobId => setForm(f => ({ ...f, jobId }))}
                  jobs={activeClient.jobs}
                  projectId={clientId}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">Rate override <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="per hr" min="0" step="0.01" className={field} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))} className="rounded" />
            Billable
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

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

export function NewJobModal({ clients, onClose, onCreated }: NewJobModalProps) {
  const [clientId, setClientId] = useState(clients.length === 1 ? clients[0].id : '')
  const [jobName, setJobName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
            <select
              required
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              autoFocus
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Job name <span className="text-destructive">*</span></label>
            <input
              type="text"
              required
              value={jobName}
              onChange={e => setJobName(e.target.value)}
              placeholder="Brand redesign, Q2 retainer…"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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

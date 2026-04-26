'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VendorDoc { id: string; fileType: string; fileName: string }
interface Vendor {
  id: string
  name: string
  email: string | null
  phone: string | null
  specialty: string | null
  documents: VendorDoc[]
  _count: { workOrders: number; bills: number }
}

interface Props { vendors: Vendor[] }

export function VendorList({ vendors: initial }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', specialty: '', notes: '' })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const json = await res.json()
        setVendors(prev => [...prev, { ...json.data, documents: [], _count: { workOrders: 0, bills: 0 } }].sort((a, b) => a.name.localeCompare(b.name)))
        setForm({ name: '', email: '', phone: '', specialty: '', notes: '' })
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Vendors</h1>
          <p className="text-sm text-muted-foreground">{vendors.length} vendor{vendors.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Cancel' : 'Add vendor'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">New vendor</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                placeholder="Studio XYZ"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Specialty</label>
              <input
                value={form.specialty}
                onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))}
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                placeholder="Audio Mixing, Plumbing…"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create vendor'}
            </button>
          </div>
        </form>
      )}

      {vendors.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No vendors yet. Add your first subcontractor or service provider.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Specialty</th>
                <th className="text-left px-3 py-2 font-medium">Contact</th>
                <th className="text-right px-3 py-2 font-medium">Jobs</th>
                <th className="text-right px-3 py-2 font-medium">Bills</th>
                <th className="text-right px-3 py-2 font-medium">Docs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendors.map(v => (
                <tr key={v.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Link href={`/vendors/${v.id}`} className="font-medium hover:underline">
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{v.specialty ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{v.email ?? v.phone ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{v._count.workOrders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{v._count.bills}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', v.documents.length > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                    {v.documents.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

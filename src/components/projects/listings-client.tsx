'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface UnitOption {
  id: string
  unitLabel: string
  status: string
}

interface Listing {
  id: string
  title: string
  monthlyRent: number
  applicationFee: number | null
  screeningFee: number | null
  availableDate: string | null
  petPolicy: string | null
  photos: string[]
  amenities: string | null
  description: string | null
  isActive: boolean
  publicSlug: string
  unit: { id: string; unitLabel: string; status: string }
  _count: { applicants: number }
}

interface Props {
  projectId: string
  listings: Listing[]
  units: UnitOption[]
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

export function ListingsClient({ projectId, listings: initialListings, units }: Props) {
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    unitId: units.length === 1 ? units[0].id : '',
    title: '',
    description: '',
    monthlyRent: '',
    availableDate: '',
    petPolicy: '',
    amenities: '',
    applicationFee: '',
    screeningFee: '',
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: form.unitId,
          title: form.title,
          description: form.description || undefined,
          monthlyRent: parseFloat(form.monthlyRent),
          availableDate: form.availableDate || undefined,
          petPolicy: form.petPolicy || undefined,
          amenities: form.amenities || undefined,
          applicationFee: form.applicationFee ? parseFloat(form.applicationFee) : undefined,
          screeningFee: form.screeningFee ? parseFloat(form.screeningFee) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCreateError(json.error ?? 'Failed to create listing')
        return
      }
      setListings(prev => [json.data, ...prev])
      setShowCreateModal(false)
      setForm({ unitId: units.length === 1 ? units[0].id : '', title: '', description: '', monthlyRent: '', availableDate: '', petPolicy: '', amenities: '', applicationFee: '', screeningFee: '' })
    } catch {
      setCreateError('Network error. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(listing: Listing) {
    const res = await fetch(`/api/projects/${projectId}/listings/${listing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !listing.isActive }),
    })
    if (res.ok) {
      const json = await res.json()
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, ...json.data } : l))
    }
  }

  async function copyLink(slug: string, id: string) {
    const url = `${APP_URL}/apply/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold">Listings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{listings.length} listing{listings.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Create listing
        </button>
      </div>

      {listings.length === 0 ? (
        <div className="border rounded-xl p-12 text-center">
          <p className="text-sm text-muted-foreground">No listings yet. Create one to start accepting inquiries.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Unit</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Title</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Rent</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Inquiries</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing, i) => (
                <tr key={listing.id} className={cn('border-b last:border-0', i % 2 === 0 ? 'bg-background' : 'bg-muted/10')}>
                  <td className="px-4 py-3 font-medium">{listing.unit.unitLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground">{listing.title}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtCurrency(listing.monthlyRent)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      listing.isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-gray-100 text-gray-500'
                    )}>
                      {listing.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{listing._count.applicants}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => copyLink(listing.publicSlug, listing.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        {copiedId === listing.id ? 'Copied!' : 'Copy link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(listing)}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {listing.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create listing modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl bg-background border shadow-lg p-6 space-y-4 my-4">
            <h3 className="text-sm font-semibold">Create listing</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Unit <span className="text-destructive">*</span></label>
                <select
                  required
                  value={form.unitId}
                  onChange={e => setForm(f => ({ ...f, unitId: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select unit…</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.unitLabel}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Title <span className="text-destructive">*</span></label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Cozy 2BR near downtown"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Monthly rent <span className="text-destructive">*</span></label>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.monthlyRent}
                  onChange={e => setForm(f => ({ ...f, monthlyRent: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="1500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Available date</label>
                  <input
                    type="date"
                    value={form.availableDate}
                    onChange={e => setForm(f => ({ ...f, availableDate: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Pet policy</label>
                  <select
                    value={form.petPolicy}
                    onChange={e => setForm(f => ({ ...f, petPolicy: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Not specified</option>
                    <option value="allowed">Allowed</option>
                    <option value="case-by-case">Case-by-case</option>
                    <option value="no-pets">No pets</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Application fee ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.applicationFee}
                    onChange={e => setForm(f => ({ ...f, applicationFee: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Screening fee ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.screeningFee}
                    onChange={e => setForm(f => ({ ...f, screeningFee: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Amenities</label>
                <input
                  type="text"
                  value={form.amenities}
                  onChange={e => setForm(f => ({ ...f, amenities: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="In-unit laundry, parking, gym…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Describe the unit…"
                />
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateError(null) }}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating…' : 'Create listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

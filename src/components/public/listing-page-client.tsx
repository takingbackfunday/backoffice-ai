'use client'

import { useState } from 'react'

interface SerializedListing {
  id: string
  title: string
  description: string | null
  monthlyRent: number
  availableDate: string | null
  petPolicy: string | null
  photos: string[]
  amenities: string | null
  applicationFee: number | null
  screeningFee: number | null
  publicSlug: string
  unit: {
    id: string
    unitLabel: string
    bedrooms: number | null
    bathrooms: number | null
    squareFootage: number | null
    monthlyRent: number | null
    propertyProfile: {
      address: string
      city: string | null
      state: string | null
      workspace: { name: string }
    }
  }
}

interface Props {
  listing: SerializedListing
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

export function ListingPageClient({ listing }: Props) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    desiredMoveIn: '',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { unit } = listing
  const propertyName = unit.propertyProfile.workspace.name
  const address = [
    unit.propertyProfile.address,
    unit.propertyProfile.city,
    unit.propertyProfile.state,
  ]
    .filter(Boolean)
    .join(', ')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingSlug: listing.publicSlug, ...form }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const petPolicyLabel: Record<string, string> = {
    allowed: 'Pets allowed',
    'case-by-case': 'Pets considered case-by-case',
    'no-pets': 'No pets',
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">{propertyName} · {address}</p>
        <h1 className="text-2xl font-bold">{listing.title}</h1>
        <p className="text-3xl font-bold mt-2">{fmtCurrency(listing.monthlyRent)}<span className="text-base font-normal text-muted-foreground">/mo</span></p>
      </div>

      {/* Photo gallery */}
      {listing.photos.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {listing.photos.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={`Photo ${i + 1}`}
              className="h-48 w-72 flex-shrink-0 rounded-lg object-cover border"
            />
          ))}
        </div>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4 border rounded-xl p-5 bg-muted/30">
        {unit.bedrooms != null && (
          <div>
            <p className="text-xs text-muted-foreground">Bedrooms</p>
            <p className="font-semibold">{unit.bedrooms}</p>
          </div>
        )}
        {unit.bathrooms != null && (
          <div>
            <p className="text-xs text-muted-foreground">Bathrooms</p>
            <p className="font-semibold">{unit.bathrooms}</p>
          </div>
        )}
        {unit.squareFootage != null && (
          <div>
            <p className="text-xs text-muted-foreground">Square footage</p>
            <p className="font-semibold">{unit.squareFootage.toLocaleString()} sq ft</p>
          </div>
        )}
        {listing.availableDate && (
          <div>
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="font-semibold">{fmtDate(listing.availableDate)}</p>
          </div>
        )}
        {listing.petPolicy && (
          <div>
            <p className="text-xs text-muted-foreground">Pet policy</p>
            <p className="font-semibold">{petPolicyLabel[listing.petPolicy] ?? listing.petPolicy}</p>
          </div>
        )}
      </div>

      {/* Amenities */}
      {listing.amenities && (
        <div>
          <h2 className="text-sm font-semibold mb-1">Amenities</h2>
          <p className="text-sm text-muted-foreground">{listing.amenities}</p>
        </div>
      )}

      {/* Description */}
      {listing.description && (
        <div>
          <h2 className="text-sm font-semibold mb-1">About this unit</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{listing.description}</p>
        </div>
      )}

      {/* Inquiry form */}
      <div className="border rounded-xl p-6 space-y-4">
        <h2 className="text-base font-semibold">Inquire about this unit</h2>

        {submitted ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
            Thanks! We received your inquiry and will be in touch soon.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Name <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Desired move-in</label>
                <input
                  type="date"
                  value={form.desiredMoveIn}
                  onChange={e => setForm(f => ({ ...f, desiredMoveIn: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Message</label>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Any questions or details you'd like to share…"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Sending…' : 'Send inquiry'}
            </button>

            {(listing.applicationFee || listing.screeningFee) && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Submitting this form only expresses your interest — no payment is required now.
                If selected to move forward, you will receive an invitation to complete a full
                application.{' '}
                {listing.applicationFee && listing.screeningFee ? (
                  <>A {fmtCurrency(listing.applicationFee)} application fee and a {fmtCurrency(listing.screeningFee)} screening fee will apply at that time.</>
                ) : listing.applicationFee ? (
                  <>A {fmtCurrency(listing.applicationFee)} application fee will apply at that time.</>
                ) : (
                  <>A {fmtCurrency(listing.screeningFee!)} screening fee will apply at that time.</>
                )}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'

interface SerializedLease {
  id: string
  signingToken: string
  tenantSignedAt: string | null
  contractStatus: string
  startDate: string
  endDate: string
  monthlyRent: number
  securityDeposit: number | null
  currency: string
  contractNotes: string | null
  tenant: { name: string; email: string }
  unit: {
    unitLabel: string
    propertyProfile: {
      address: string
      city: string | null
      state: string | null
      workspace: { name: string }
    }
  }
}

interface Props {
  lease: SerializedLease
}

const fmtCurrency = (n: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

export function LeaseSigningClient({ lease }: Props) {
  const [signatureName, setSignatureName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(!!lease.tenantSignedAt)
  const [error, setError] = useState<string | null>(null)

  const { unit } = lease
  const propertyName = unit.propertyProfile.workspace.name
  const address = [unit.propertyProfile.address, unit.propertyProfile.city, unit.propertyProfile.state]
    .filter(Boolean)
    .join(', ')
  const pdfUrl = `/api/public/lease-pdf/${lease.signingToken}`

  async function handleSign() {
    if (!signatureName.trim() || signatureName.trim().length < 2) {
      setError('Please type your full name as your signature.')
      return
    }
    if (!agreed) {
      setError('You must check the agreement box.')
      return
    }
    setError(null)
    setSigning(true)
    try {
      const res = await fetch('/api/public/lease-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: lease.signingToken, signatureName: signatureName.trim(), agreed: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong')
        return
      }
      setSigned(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSigning(false)
    }
  }

  if (signed) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Lease signed!</h1>
        <p className="text-sm text-muted-foreground">
          Your signature has been recorded. The property manager will countersign and you will receive a copy.
        </p>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors mt-2"
        >
          View lease PDF
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">{propertyName} · {address}</p>
        <h1 className="text-2xl font-bold mt-0.5">Lease Agreement</h1>
        <p className="text-sm text-muted-foreground mt-1">Unit {unit.unitLabel} · {lease.tenant.name}</p>
      </div>

      {/* Lease summary */}
      <div className="border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">Lease summary</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Start date</p>
            <p className="font-medium">{fmtDate(lease.startDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">End date</p>
            <p className="font-medium">{fmtDate(lease.endDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Monthly rent</p>
            <p className="font-medium">{fmtCurrency(lease.monthlyRent, lease.currency)}</p>
          </div>
          {lease.securityDeposit && (
            <div>
              <p className="text-xs text-muted-foreground">Security deposit</p>
              <p className="font-medium">{fmtCurrency(lease.securityDeposit, lease.currency)}</p>
            </div>
          )}
        </div>
        {lease.contractNotes && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{lease.contractNotes}</p>
          </div>
        )}
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          View full lease (PDF)
        </a>
      </div>

      {/* Signature section */}
      <div className="border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Sign lease</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          By typing your name below, you acknowledge that you have read, understand, and agree to the terms of this lease agreement. This is an acknowledgment of receipt and agreement, not a qualified electronic signature.
        </p>
        <div>
          <label className="block text-xs font-medium mb-1">
            Type your full name as signature <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={signatureName}
            onChange={e => setSignatureName(e.target.value)}
            className="w-full rounded-md border px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ fontFamily: "'Brush Script MT', cursive" }}
            placeholder="Your full name"
          />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border flex-shrink-0"
          />
          <span className="text-sm">I have read and agree to the terms of this lease agreement. <span className="text-destructive">*</span></span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="button"
          onClick={handleSign}
          disabled={signing || !signatureName.trim() || !agreed}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {signing ? 'Signing…' : 'Sign lease'}
        </button>
      </div>
    </div>
  )
}

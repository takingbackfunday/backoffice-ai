'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

interface Props {
  initial: PaymentMethods
  initialBusinessName?: string
  initialYourName?: string
  initialPaymentNote?: string
  initialEmail?: string
  initialPhone?: string
  initialAddress?: string
  initialVatNumber?: string
  initialWebsite?: string
}

function F({ label, value, onChange, placeholder, mono = false }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-1.5 first:mt-0">{children}</p>
}

export function PaymentSettingsForm({
  initial,
  initialBusinessName = '',
  initialYourName = '',
  initialPaymentNote = '',
  initialEmail = '',
  initialPhone = '',
  initialAddress = '',
  initialVatNumber = '',
  initialWebsite = '',
}: Props) {
  const [businessName, setBusinessName] = useState(initialBusinessName)
  const [yourName, setYourName] = useState(initialYourName)
  const [email, setEmail] = useState(initialEmail)
  const [phone, setPhone] = useState(initialPhone)
  const [address, setAddress] = useState(initialAddress)
  const [vatNumber, setVatNumber] = useState(initialVatNumber)
  const [website, setWebsite] = useState(initialWebsite)

  const bt = initial.bankTransfer ?? {}
  const [accountName, setAccountName] = useState(bt.accountName ?? '')
  const [bankName, setBankName] = useState(bt.bankName ?? '')
  const [iban, setIban] = useState(bt.iban ?? '')
  const [swift, setSwift] = useState(bt.swift ?? '')
  const [sortCode, setSortCode] = useState(bt.sortCode ?? '')
  const [accountNumber, setAccountNumber] = useState(bt.accountNumber ?? '')
  const [routingNumber, setRoutingNumber] = useState(bt.routingNumber ?? '')
  const [paypalLink, setPaypalLink] = useState(initial.paypal?.link ?? '')
  const [stripeLink, setStripeLink] = useState(initial.stripe?.link ?? '')
  const [customMethods, setCustomMethods] = useState<{ label: string; value: string }[]>(initial.custom ?? [])
  const [paymentNote, setPaymentNote] = useState(initialPaymentNote)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  function buildPayload() {
    const bankTransfer: PaymentMethods['bankTransfer'] = {}
    if (accountName) bankTransfer.accountName = accountName
    if (bankName) bankTransfer.bankName = bankName
    if (iban) bankTransfer.iban = iban
    if (swift) bankTransfer.swift = swift
    if (sortCode) bankTransfer.sortCode = sortCode
    if (accountNumber) bankTransfer.accountNumber = accountNumber
    if (routingNumber) bankTransfer.routingNumber = routingNumber

    const paymentMethods: PaymentMethods = {}
    if (Object.keys(bankTransfer).length > 0) paymentMethods.bankTransfer = bankTransfer
    if (paypalLink) paymentMethods.paypal = { link: paypalLink }
    if (stripeLink) paymentMethods.stripe = { link: stripeLink }
    const validCustom = customMethods.filter(m => m.label.trim() && m.value.trim())
    if (validCustom.length > 0) paymentMethods.custom = validCustom

    return {
      paymentMethods,
      businessName: businessName || undefined,
      yourName: yourName || undefined,
      invoicePaymentNote: paymentNote || undefined,
      fromEmail: email || undefined,
      fromPhone: phone || undefined,
      fromAddress: address || undefined,
      fromVatNumber: vatNumber || undefined,
      fromWebsite: website || undefined,
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) { setError('Failed to save'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewUrl(null)
    try {
      const res = await fetch('/api/settings/preview-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) { setError('Failed to generate preview'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
    } catch {
      setError('Failed to generate preview')
    } finally {
      setPreviewing(false)
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  return (
    <>
      <div className="rounded-xl border p-4 space-y-0 max-w-xl">

        <SectionLabel>Business profile</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <F label="Business / trading name" value={businessName} onChange={setBusinessName} placeholder="Acme Studio" />
          <F label="Your name" value={yourName} onChange={setYourName} placeholder="Jane Smith" />
        </div>
        <div className="mt-2">
          <F label="Address" value={address} onChange={setAddress} placeholder="123 Main St, London, EC1A 1BB" />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <F label="Email" value={email} onChange={setEmail} placeholder="hello@acmestudio.com" />
          <F label="Phone" value={phone} onChange={setPhone} placeholder="+44 7700 900000" />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <F label="Website" value={website} onChange={setWebsite} placeholder="acmestudio.com" />
          <F label="VAT / Tax number" value={vatNumber} onChange={setVatNumber} placeholder="GB123456789" mono />
        </div>

        <SectionLabel>Bank transfer</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <F label="Account name" value={accountName} onChange={setAccountName} placeholder="Your Name or Business" />
          <F label="Bank name" value={bankName} onChange={setBankName} placeholder="Barclays, Chase…" />
        </div>
        <div className="mt-2">
          <F label="IBAN" value={iban} onChange={setIban} placeholder="GB29 NWBK 6016 1331 9268 19" mono />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <F label="SWIFT / BIC" value={swift} onChange={setSwift} placeholder="NWBKGB2L" mono />
          <F label="Sort code (UK)" value={sortCode} onChange={setSortCode} placeholder="60-16-13" mono />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <F label="Account number" value={accountNumber} onChange={setAccountNumber} placeholder="31926819" mono />
          <F label="Routing number (US ACH)" value={routingNumber} onChange={setRoutingNumber} placeholder="021000021" mono />
        </div>

        <SectionLabel>Online payments</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <F label="PayPal link or email" value={paypalLink} onChange={setPaypalLink} placeholder="paypal.me/yourname" />
          <F label="Stripe payment link" value={stripeLink} onChange={setStripeLink} placeholder="buy.stripe.com/…" />
        </div>

        <SectionLabel>Custom payment methods</SectionLabel>
        <div className="space-y-1.5">
          {customMethods.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={m.label}
                onChange={e => setCustomMethods(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder="Label (e.g. Wise)"
                className="w-24 shrink-0 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
              />
              <input
                type="text"
                value={m.value}
                onChange={e => setCustomMethods(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                placeholder="Account, email, handle…"
                className="flex-1 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setCustomMethods(prev => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCustomMethods(prev => [...prev, { label: '', value: '' }])}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add method
          </button>
        </div>

        <SectionLabel>Payment instructions</SectionLabel>
        <textarea
          value={paymentNote}
          onChange={e => setPaymentNote(e.target.value)}
          rows={2}
          placeholder="Please include your invoice number and full name in your payment reference."
          className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary resize-none"
        />

        {error && <p className="text-xs text-destructive pt-1">{error}</p>}

        <div className="flex items-center gap-3 pt-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing}
            className="rounded-md border px-4 py-1.5 text-xs font-semibold hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            {previewing ? 'Generating…' : 'Preview invoice'}
          </button>
          {saved && <span className="text-xs text-green-600">Saved ✓</span>}
        </div>
      </div>

      {/* PDF Preview Modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closePreview}
        >
          <div
            className="relative bg-white rounded-xl shadow-2xl overflow-hidden"
            style={{ width: 'min(90vw, 860px)', height: 'min(92vh, 1100px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <span className="text-sm font-semibold">Invoice preview</span>
              <button
                type="button"
                onClick={closePreview}
                className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <iframe
              src={previewUrl}
              className="w-full"
              style={{ height: 'calc(100% - 45px)', border: 'none' }}
              title="Invoice preview"
            />
          </div>
        </div>
      )}
    </>
  )
}

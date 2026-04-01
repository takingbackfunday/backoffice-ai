'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

interface Props {
  initial: PaymentMethods
  initialBusinessName?: string
  initialYourName?: string
  initialPaymentNote?: string
}

function Field({ label, value, onChange, placeholder, mono = false }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5 space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}

export function PaymentSettingsForm({ initial, initialBusinessName = '', initialYourName = '', initialPaymentNote = '' }: Props) {
  const [businessName, setBusinessName] = useState(initialBusinessName)
  const [yourName, setYourName] = useState(initialYourName)
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

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)

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

    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethods,
          businessName: businessName || undefined,
          yourName: yourName || undefined,
          invoicePaymentNote: paymentNote || undefined,
        }),
      })
      if (!res.ok) { setError('Failed to save'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">

      <Section title="Business profile">
        <p className="text-xs text-muted-foreground -mt-1">Appears as the sender on all invoices and emails.</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Business / trading name" value={businessName} onChange={setBusinessName} placeholder="Acme Studio" />
          <Field label="Your name" value={yourName} onChange={setYourName} placeholder="Jane Smith" />
        </div>
      </Section>

      <Section title="Bank transfer">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account name" value={accountName} onChange={setAccountName} placeholder="Your Name or Business Name" />
          <Field label="Bank name" value={bankName} onChange={setBankName} placeholder="Barclays, Chase…" />
        </div>
        <Field label="IBAN" value={iban} onChange={setIban} placeholder="GB29 NWBK 6016 1331 9268 19" mono />
        <div className="grid grid-cols-2 gap-4">
          <Field label="SWIFT / BIC" value={swift} onChange={setSwift} placeholder="NWBKGB2L" mono />
          <Field label="Sort code (UK)" value={sortCode} onChange={setSortCode} placeholder="60-16-13" mono />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account number" value={accountNumber} onChange={setAccountNumber} placeholder="31926819" mono />
          <Field label="Routing number (US ACH)" value={routingNumber} onChange={setRoutingNumber} placeholder="021000021" mono />
        </div>
      </Section>

      <Section title="PayPal">
        <Field
          label="PayPal link or email"
          value={paypalLink}
          onChange={setPaypalLink}
          placeholder="paypal.me/yourname or you@email.com"
        />
      </Section>

      <Section title="Stripe">
        <Field
          label="Stripe payment link"
          value={stripeLink}
          onChange={setStripeLink}
          placeholder="buy.stripe.com/…"
        />
      </Section>

      <Section title="Custom payment methods">
        <p className="text-xs text-muted-foreground -mt-1">Add any other payment options (e.g. Wise, Revolut, Zelle, cash). Each appears as a block on invoices and emails.</p>
        <div className="space-y-2">
          {customMethods.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={m.label}
                onChange={e => setCustomMethods(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder="Label (e.g. Wise)"
                className="w-32 shrink-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <input
                type="text"
                value={m.value}
                onChange={e => setCustomMethods(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                placeholder="Details (account, email, handle…)"
                className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setCustomMethods(prev => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCustomMethods(prev => [...prev, { label: '', value: '' }])}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add method
        </button>
      </Section>

      <Section title="Payment instructions">
        <p className="text-xs text-muted-foreground -mt-1">Shown at the bottom of the "How to pay" section on every invoice PDF.</p>
        <textarea
          value={paymentNote}
          onChange={e => setPaymentNote(e.target.value)}
          rows={2}
          placeholder="Please include the invoice number in your payment reference."
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </Section>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
      </div>
    </div>
  )
}

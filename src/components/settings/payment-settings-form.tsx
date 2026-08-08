'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'
import type { InvoiceTemplateId } from '@/lib/pdf/invoice-templates'
import { LogoUpload } from '@/components/settings/logo-upload'
import { InvoiceTemplatePicker } from '@/components/settings/invoice-template-picker'
import { InvoicePreviewPanel } from '@/components/settings/invoice-preview-panel'
import { useLiveInvoicePreview } from '@/components/settings/hooks/use-live-invoice-preview'

interface Props {
  initial: PaymentMethods
  initialBusinessName?: string
  initialYourName?: string
  initialLogoUrl?: string
  initialPaymentNote?: string
  initialNotesDefault?: string
  initialEmail?: string
  initialPhone?: string
  initialAddress?: string
  initialVatNumber?: string
  initialWebsite?: string
  initialTemplate?: InvoiceTemplateId
  initialShowBusinessName?: boolean
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

export function Section({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="rounded-lg border bg-white">
      <div className="px-4 py-2.5 border-b bg-muted/30 rounded-t-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">{title}</p>
        {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="px-4 py-3 space-y-2">
        {children}
      </div>
    </div>
  )
}

export function PaymentSettingsForm({
  initial,
  initialBusinessName = '',
  initialYourName = '',
  initialLogoUrl = '',
  initialPaymentNote = '',
  initialNotesDefault = '',
  initialEmail = '',
  initialPhone = '',
  initialAddress = '',
  initialVatNumber = '',
  initialWebsite = '',
  initialTemplate = 'top-left',
  initialShowBusinessName = true,
}: Props) {
  const [businessName, setBusinessName] = useState(initialBusinessName)
  const [yourName, setYourName] = useState(initialYourName)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl || null)
  const [email, setEmail] = useState(initialEmail)
  const [phone, setPhone] = useState(initialPhone)
  const [address, setAddress] = useState(initialAddress)
  const [vatNumber, setVatNumber] = useState(initialVatNumber)
  const [website, setWebsite] = useState(initialWebsite)
  const [template, setTemplate] = useState<InvoiceTemplateId>(initialTemplate)
  const [showBusinessName, setShowBusinessName] = useState(initialShowBusinessName)

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
  const [notesDefault, setNotesDefault] = useState(initialNotesDefault)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      businessName: businessName || null,
      yourName: yourName || null,
      logoUrl: logoUrl || null,
      invoicePaymentNote: paymentNote || null,
      invoiceNotesDefault: notesDefault || null,
      invoiceTemplate: template,
      invoiceShowBusinessName: showBusinessName,
      fromEmail: email || null,
      fromPhone: phone || null,
      fromAddress: address || null,
      fromVatNumber: vatNumber || null,
      fromWebsite: website || null,
    }
  }

  const { previewUrl, updating: previewUpdating, previewError: livePreviewError } = useLiveInvoicePreview(JSON.stringify(buildPayload()))

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

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="space-y-4 max-w-xl flex-1 min-w-0">

        <Section title="Business profile" description="Your name, business info, and contact details that appear on invoices." id="business-profile">
          <LogoUpload initialLogoUrl={logoUrl ?? undefined} onChange={(url) => {
            setLogoUrl(url)
            if (!url) setShowBusinessName(true)
          }} />
          <div className="grid grid-cols-2 gap-2">
            <F label="Business / trading name" value={businessName} onChange={setBusinessName} placeholder="Acme Studio" />
            <F label="Your name" value={yourName} onChange={setYourName} placeholder="Jane Smith" />
          </div>
          <F label="Address" value={address} onChange={setAddress} placeholder="123 Main St, London, EC1A 1BB" />
          <div className="grid grid-cols-2 gap-2">
            <F label="Email" value={email} onChange={setEmail} placeholder="hello@acmestudio.com" />
            <F label="Phone" value={phone} onChange={setPhone} placeholder="+44 7700 900000" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <F label="Website" value={website} onChange={setWebsite} placeholder="acmestudio.com" />
            <F label="VAT / Tax number" value={vatNumber} onChange={setVatNumber} placeholder="GB123456789" mono />
          </div>
        </Section>

        <Section title="Invoice template" description="Choose a layout and toggle your logo or business name on invoice headers." id="invoice-template">
          <InvoiceTemplatePicker
            value={template}
            onChange={setTemplate}
            showBusinessName={showBusinessName}
            onShowBusinessNameChange={setShowBusinessName}
            hasLogo={!!logoUrl}
          />
        </Section>

        <div id="payment-methods" className="space-y-4">
        <Section title="Bank transfer" description="Bank account details shown on invoices for wire transfers.">
          <div className="grid grid-cols-2 gap-2">
            <F label="Account name" value={accountName} onChange={setAccountName} placeholder="Your Name or Business" />
            <F label="Bank name" value={bankName} onChange={setBankName} placeholder="Barclays, Chase…" />
          </div>
          <F label="IBAN" value={iban} onChange={setIban} placeholder="GB29 NWBK 6016 1331 9268 19" mono />
          <div className="grid grid-cols-2 gap-2">
            <F label="SWIFT / BIC" value={swift} onChange={setSwift} placeholder="NWBKGB2L" mono />
            <F label="Sort code (UK)" value={sortCode} onChange={setSortCode} placeholder="60-16-13" mono />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <F label="Account number" value={accountNumber} onChange={setAccountNumber} placeholder="31926819" mono />
            <F label="Routing number (US ACH)" value={routingNumber} onChange={setRoutingNumber} placeholder="021000021" mono />
          </div>
        </Section>

        <Section title="Online payments" description="PayPal, Stripe, or custom payment links displayed on invoices.">
          <div className="grid grid-cols-2 gap-2">
            <F label="PayPal link or email" value={paypalLink} onChange={setPaypalLink} placeholder="paypal.me/yourname" />
            <F label="Stripe payment link" value={stripeLink} onChange={setStripeLink} placeholder="buy.stripe.com/…" />
          </div>
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
        </Section>
        </div>

        <Section title="Default invoice notes" description="Pre-filled notes on every new invoice. Edit per-invoice as needed." id="invoice-notes-default">
          <textarea
            value={notesDefault}
            onChange={e => setNotesDefault(e.target.value)}
            rows={3}
            placeholder="Leave blank to show nothing by default. You can always edit per-invoice."
            className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary resize-none"
          />
        </Section>

        <Section title="Payment instructions" description="Extra instructions shown below the payment methods on invoices." id="payment-instructions">
          <textarea
            value={paymentNote}
            onChange={e => setPaymentNote(e.target.value)}
            rows={2}
            placeholder="Please include your invoice number and full name in your payment reference."
            className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary resize-none"
          />
        </Section>

        {(error || livePreviewError) && <p className="text-xs text-destructive">{error || livePreviewError}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <span className="text-xs text-green-600">Saved ✓</span>}
        </div>
      </div>

      <InvoicePreviewPanel previewUrl={previewUrl} updating={previewUpdating} error={livePreviewError} />
    </div>
  )
}

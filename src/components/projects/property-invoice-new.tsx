'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'

interface ActiveLease {
  leaseId: string
  unitLabel: string
  tenantId: string
  tenantName: string
  tenantEmail: string
  monthlyRent: number | null
  currency: string
}

interface LineItem {
  id: string
  description: string
  quantity: string
  unitPrice: string
  chargeType: string
}

const CHARGE_TYPES = [
  { value: 'RENT',        label: 'Rent' },
  { value: 'DEPOSIT',     label: 'Deposit' },
  { value: 'LATE_FEE',    label: 'Late fee' },
  { value: 'UTILITY',     label: 'Utility' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'OTHER',       label: 'Other' },
]

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'SGD', 'HKD', 'CVE']

function uid() { return Math.random().toString(36).slice(2) }

function defaultDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().split('T')[0]
}

export function PropertyInvoiceNew({
  projectId,
  projectSlug,
  activeLeases,
}: {
  projectId: string
  projectSlug: string
  activeLeases: ActiveLease[]
}) {
  const router = useRouter()
  const [selectedLeaseId, setSelectedLeaseId] = useState(activeLeases[0]?.leaseId ?? '')
  const [currency, setCurrency] = useState(activeLeases[0]?.currency ?? 'USD')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>(() => {
    const first = activeLeases[0]
    if (first?.monthlyRent) {
      return [{
        id: uid(),
        description: 'Monthly rent',
        quantity: '1',
        unitPrice: String(first.monthlyRent),
        chargeType: 'RENT',
      }]
    }
    return [{ id: uid(), description: '', quantity: '1', unitPrice: '', chargeType: 'RENT' }]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedLease = activeLeases.find(l => l.leaseId === selectedLeaseId)

  function handleLeaseChange(leaseId: string) {
    setSelectedLeaseId(leaseId)
    const lease = activeLeases.find(l => l.leaseId === leaseId)
    if (lease) {
      setCurrency(lease.currency)
      if (lease.monthlyRent) {
        setLineItems([{
          id: uid(),
          description: 'Monthly rent',
          quantity: '1',
          unitPrice: String(lease.monthlyRent),
          chargeType: 'RENT',
        }])
      }
    }
  }

  function addLineItem() {
    setLineItems(prev => [...prev, { id: uid(), description: '', quantity: '1', unitPrice: '', chargeType: 'RENT' }])
  }

  function removeLineItem(id: string) {
    setLineItems(prev => prev.filter(i => i.id !== id))
  }

  function updateLineItem(id: string, key: keyof LineItem, value: string) {
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, [key]: value } : i))
  }

  const subtotal = lineItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0), 0)
  const fmtAmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)

  async function handleSubmit() {
    if (!selectedLeaseId) { setError('Please select a lease'); return }
    const items = lineItems.filter(i => i.description.trim() && parseFloat(i.unitPrice) >= 0)
    if (items.length === 0) { setError('Add at least one line item'); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseId: selectedLeaseId,
          tenantId: selectedLease?.tenantId,
          dueDate,
          currency,
          notes: notes.trim() || undefined,
          lineItems: items.map(i => ({
            description: i.description,
            quantity: parseFloat(i.quantity) || 1,
            unitPrice: parseFloat(i.unitPrice) || 0,
            chargeType: i.chargeType || undefined,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to create invoice'); return }
      router.push(`/projects/${projectSlug}/invoices/${json.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (activeLeases.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/30 p-8 text-center max-w-lg">
        <p className="text-sm font-medium mb-1">No active leases</p>
        <p className="text-xs text-muted-foreground">Create an active lease with a tenant before generating an invoice.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Lease selector */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Tenant / Lease</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Lease</label>
            <select
              value={selectedLeaseId}
              onChange={e => handleLeaseChange(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {activeLeases.map(l => (
                <option key={l.leaseId} value={l.leaseId}>
                  {l.unitLabel} — {l.tenantName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {selectedLease && (
          <p className="text-xs text-muted-foreground">
            {selectedLease.tenantEmail}
          </p>
        )}
      </div>

      {/* Line items */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Charges</h3>
        <div className="space-y-2">
          {lineItems.map(item => (
            <div key={item.id} className="grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 items-center">
              <input
                value={item.description}
                onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                placeholder="Description"
                className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <select
                value={item.chargeType}
                onChange={e => updateLineItem(item.id, 'chargeType', e.target.value)}
                className="rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {CHARGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                value={item.quantity}
                onChange={e => updateLineItem(item.id, 'quantity', e.target.value)}
                placeholder="Qty"
                type="number"
                min="0"
                step="0.01"
                className="rounded-lg border px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                value={item.unitPrice}
                onChange={e => updateLineItem(item.id, 'unitPrice', e.target.value)}
                placeholder="Amount"
                type="number"
                min="0"
                step="0.01"
                className="rounded-lg border px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => removeLineItem(item.id)}
                disabled={lineItems.length === 1}
                className="flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addLineItem}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add line
        </button>
        <div className="flex justify-end pt-2 border-t">
          <span className="text-sm font-semibold">{fmtAmt(subtotal)}</span>
        </div>
      </div>

      {/* Due date + notes */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Creating…' : 'Create invoice'}
        </button>
      </div>

    </div>
  )
}

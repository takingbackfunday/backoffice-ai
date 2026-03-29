'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, X, Trash2 } from 'lucide-react'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'

interface LineItemInput {
  description: string
  quantity: string
  unitPrice: string
}

interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

interface InvoicePayment {
  id: string
  amount: number
  paidDate: string
}

interface Job {
  id: string
  name: string
}

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string
  dueDate: string
  currency: string
  notes: string | null
  job: { id: string; name: string } | null
  lineItems: LineItem[]
  payments: InvoicePayment[]
}

interface Props {
  projectId: string
  projectSlug: string
  jobs: Job[]
  invoices: Invoice[]
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

function invoiceTotal(items: LineItem[]) {
  return items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
}

function invoicePaid(payments: InvoicePayment[]) {
  return payments.reduce((s, p) => s + Number(p.amount), 0)
}

const DEFAULT_LINE_ITEM: LineItemInput = { description: '', quantity: '1', unitPrice: '' }

export function InvoiceList({ projectId, projectSlug, jobs, invoices: initial }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [jobId, setJobId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItemInput[]>([{ ...DEFAULT_LINE_ITEM }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addLineItem() {
    setLineItems(prev => [...prev, { ...DEFAULT_LINE_ITEM }])
  }

  function updateLineItem(i: number, key: keyof LineItemInput, value: string) {
    setLineItems(prev => prev.map((item, idx) => idx === i ? { ...item, [key]: value } : item))
  }

  function removeLineItem(i: number) {
    setLineItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function resetForm() {
    setJobId('')
    setDueDate('')
    setCurrency('USD')
    setNotes('')
    setLineItems([{ ...DEFAULT_LINE_ITEM }])
    setError(null)
    setShowForm(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!dueDate) { setError('Due date is required'); return }

    const parsedItems = lineItems
      .filter(i => i.description.trim())
      .map(i => ({
        description: i.description.trim(),
        quantity: parseFloat(i.quantity) || 1,
        unitPrice: parseFloat(i.unitPrice) || 0,
      }))

    if (parsedItems.length === 0) { setError('At least one line item is required'); return }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: jobId || undefined,
          dueDate,
          currency,
          notes: notes || undefined,
          lineItems: parsedItems,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to create invoice'); return }
      setInvoices(prev => [json.data, ...prev])
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(invoiceId: string, status: string) {
    const res = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const json = await res.json()
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, ...json.data } : inv))
    }
  }

  const previewTotal = lineItems
    .filter(i => i.description.trim())
    .reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</h2>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New invoice
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">New invoice</h3>
            <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {jobs.length > 0 && (
              <div>
                <label className="block text-xs font-medium mb-1">Job (optional)</label>
                <select
                  value={jobId}
                  onChange={e => setJobId(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">No job</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">Due date <span className="text-destructive">*</span></label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {['USD', 'GBP', 'EUR', 'CAD', 'AUD'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Line items</label>
              <button
                type="button"
                onClick={addLineItem}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add line
              </button>
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium">Description</th>
                    <th className="text-right px-3 py-2 text-xs font-medium w-20">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-medium w-28">Unit price</th>
                    <th className="text-right px-3 py-2 text-xs font-medium w-24">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((item, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateLineItem(i, 'description', e.target.value)}
                          className="w-full text-sm focus:outline-none"
                          placeholder="Description"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateLineItem(i, 'quantity', e.target.value)}
                          className="w-full text-right text-sm focus:outline-none"
                          min="0"
                          step="0.001"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={e => updateLineItem(i, 'unitPrice', e.target.value)}
                          className="w-full text-right text-sm focus:outline-none"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right text-sm text-muted-foreground tabular-nums">
                        {fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0), currency)}
                      </td>
                      <td className="px-2 py-1.5">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(i)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold">Total</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                      {fmt(previewTotal, currency)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Payment instructions, terms, etc."
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create invoice'}
            </button>
          </div>
        </form>
      )}

      {invoices.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">No invoices yet. Create your first invoice to start tracking payments.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Invoice</th>
                <th className="text-left px-4 py-2 font-medium">Job</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-right px-4 py-2 font-medium">Paid</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Due</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map(inv => {
                const total = invoiceTotal(inv.lineItems)
                const paid = invoicePaid(inv.payments)
                const overdue = inv.status !== 'PAID' && inv.status !== 'VOID' && new Date(inv.dueDate) < new Date()
                const displayStatus = overdue && inv.status === 'SENT' ? 'OVERDUE' : inv.status
                return (
                  <tr key={inv.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <Link
                        href={`/projects/${projectSlug}/invoices/${inv.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{inv.job?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(total, inv.currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {paid > 0 ? fmt(paid, inv.currency) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={inv.status}
                        onChange={e => updateStatus(inv.id, e.target.value)}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:outline-none',
                          INVOICE_STATUS_COLORS[displayStatus] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {Object.entries(INVOICE_STATUS_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td className={cn('px-4 py-2 text-xs', overdue && inv.status !== 'PAID' && inv.status !== 'VOID' ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                      {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/projects/${projectSlug}/invoices/${inv.id}`}
                        className="text-muted-foreground hover:text-foreground"
                        title="View invoice"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

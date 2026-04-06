'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { StudioInvoiceModal } from '@/components/studio/studio-invoice-modal'
import { NewClientModal, NewJobModal, NewEstimateModal, NewQuoteModal, LogTimeModal } from '@/components/studio/studio-action-modals'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'
import { ActionBanner } from '@/components/ui/action-banner'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Kpis {
  activeClients: number
  openInvoices: number
  totalOutstanding: number
  revenueThisMonth: number
  overdueCount: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string
  dueDate: string
  currency: string
  total: number
  paid: number
  jobName: string | null
}

interface Client {
  id: string
  name: string
  slug: string
  company: string | null
  outstanding: number
  currency: string
  invoices: Invoice[]
  // For invoice creation modal
  clientProfileId: string
  contactName: string | null
  email: string | null
  paymentTermDays: number
  billingType: string
  jobs: { id: string; name: string }[]
}

interface InvoiceDefaults {
  taxEnabled?: boolean
  taxLabel?: string
  taxMode?: 'percent' | 'flat'
  taxRate?: string
  currency?: string
  notes?: string
}

interface Props {
  clients: Client[]
  kpis: Kpis
  paymentMethods: PaymentMethods
  pendingSuggestions?: number
  recentPaymentsCount?: number
  invoiceDefaults?: InvoiceDefaults
  isOnboarding?: boolean
  hasOverheadWorkspace?: boolean
}

type View = 'open' | 'paid' | 'all'

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const fmtFull = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

function getDisplayStatus(inv: Invoice): string {
  if (inv.status === 'SENT' && new Date(inv.dueDate) < new Date()) return 'OVERDUE'
  return inv.status
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function daysAgo(dateStr: string): number {
  return -daysUntil(dateStr)
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:   { bg: '#f3f4f6', text: '#374151' },
  SENT:    { bg: '#dbeafe', text: '#1e40af' },
  PARTIAL: { bg: '#fef3c7', text: '#92400e' },
  PAID:    { bg: '#d1fae5', text: '#065f46' },
  OVERDUE: { bg: '#fee2e2', text: '#991b1b' },
  VOID:    { bg: '#f3f4f6', text: '#9ca3af' },
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Sent', PARTIAL: 'Partial',
  PAID: 'Paid', OVERDUE: 'Overdue', VOID: 'Void',
}

const PLACEHOLDER_PROMPTS = [
  'Shot a wedding for Sarah — 8 hours at $200/hr plus $150 for editing',
  'Designed a logo and business cards for Marcus, flat fee $1,200',
  'Mixed and mastered 4 tracks for Alison at $300 per track',
]

/* ------------------------------------------------------------------ */
/*  StatusBadge                                                         */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.DRAFT
  return (
    <span style={{ background: c.bg, color: c.text, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  KpiCard                                                             */
/* ------------------------------------------------------------------ */

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: 'green' | 'amber' | 'red' | 'neutral' }) {
  const colors = {
    green:   { border: '#bbf7d0', bg: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', text: '#15803d' },
    amber:   { border: '#fde68a', bg: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)', text: '#a16207' },
    red:     { border: '#fecaca', bg: 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)', text: '#dc2626' },
    neutral: { border: '#e8e6df', bg: '#fafaf8', text: '#1a1a1a' },
  }
  const c = colors[color]
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${c.border}`, background: c.bg, padding: '16px 18px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color: c.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: '#aaa', marginTop: 4, marginBottom: 0 }}>{sub}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  AgingBar                                                            */
/* ------------------------------------------------------------------ */

function AgingBar({ invoices }: { invoices: (Invoice & { clientId: string })[] }) {
  const open = invoices.filter(inv => { const s = getDisplayStatus(inv); return s !== 'PAID' && s !== 'VOID' })
  const buckets = {
    current: { label: 'Current',    color: '#34d399', amount: 0, count: 0 },
    d30:     { label: '1–30 days',  color: '#fbbf24', amount: 0, count: 0 },
    d60:     { label: '31–60 days', color: '#f97316', amount: 0, count: 0 },
    d90:     { label: '60+ days',   color: '#ef4444', amount: 0, count: 0 },
  }
  for (const inv of open) {
    const s = getDisplayStatus(inv)
    let key: keyof typeof buckets = 'current'
    if (s === 'OVERDUE') {
      const days = daysAgo(inv.dueDate)
      key = days <= 30 ? 'd30' : days <= 60 ? 'd60' : 'd90'
    }
    buckets[key].amount += inv.total - inv.paid
    buckets[key].count++
  }
  const totalAmount = Object.values(buckets).reduce((s, b) => s + b.amount, 0)
  if (totalAmount === 0) return null
  return (
    <div style={{ borderRadius: 14, border: '1px solid #e8e6df', background: '#fff', padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Aging</span>
        <span style={{ fontSize: 11, color: '#aaa' }}>{fmt(totalAmount)} outstanding</span>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
        {Object.entries(buckets).map(([k, b]) => {
          const pct = b.amount / totalAmount * 100
          if (pct === 0) return null
          return <div key={k} style={{ width: `${Math.max(pct, 4)}%`, background: b.color, borderRadius: 99, transition: 'width 0.5s' }} />
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        {Object.entries(buckets).map(([k, b]) => b.count === 0 ? null : (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: 99, background: b.color }} />
            <span style={{ fontSize: 10, color: '#888' }}>{b.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#555' }}>{fmt(b.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  AiCreator                                                           */
/* ------------------------------------------------------------------ */

interface LineItemInput { description: string; quantity: number; unitPrice: number }

function AiCreator({ clients, projectSlug, onCreated }: { clients: Client[]; projectSlug: string | null; onCreated: (items: LineItemInput[], clientId: string, dueDate: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'prompt' | 'review' | 'done'>('prompt')
  const [prompt, setPrompt] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [lineItems, setLineItems] = useState<LineItemInput[]>([])
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [phIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDER_PROMPTS.length))

  useEffect(() => { if (isOpen && textRef.current) textRef.current.focus() }, [isOpen])

  function reset() { setStep('prompt'); setPrompt(''); setSelectedClient(''); setLineItems([]); setDueDate(''); setIsOpen(false); setError(null) }

  function simulateParse() {
    setLoading(true)
    setTimeout(() => {
      const items: LineItemInput[] = []
      const hourMatch = prompt.match(/(\d+)\s*hours?\s*(?:at|@)\s*\$?(\d+)/i)
      const flatMatch = prompt.match(/(?:flat\s*fee|total|for)\s*\$?([\d,]+)/i)
      const trackMatch = prompt.match(/(\d+)\s*tracks?\s*(?:at|@)\s*\$?(\d+)/i)
      if (hourMatch) items.push({ description: 'Creative session — hourly rate', quantity: parseInt(hourMatch[1]), unitPrice: parseInt(hourMatch[2]) })
      if (flatMatch) items.push({ description: 'Project — flat fee', quantity: 1, unitPrice: parseInt(flatMatch[1].replace(',', '')) })
      if (trackMatch) items.push({ description: 'Track production — per track', quantity: parseInt(trackMatch[1]), unitPrice: parseInt(trackMatch[2]) })
      const plusMatch = prompt.match(/plus\s*\$?(\d+)\s*(?:for\s+)?(.+?)(?:\.|$)/i)
      if (plusMatch) items.push({ description: plusMatch[2].trim() || 'Additional service', quantity: 1, unitPrice: parseInt(plusMatch[1]) })
      if (items.length === 0) items.push({ description: prompt.slice(0, 60), quantity: 1, unitPrice: 0 })
      setLineItems(items)
      setDueDate(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0])
      setLoading(false)
      setStep('review')
    }, 1200)
  }

  async function handleCreate() {
    if (!selectedClient || !dueDate || lineItems.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${selectedClient}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate, lineItems }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to create invoice'); return }
      setStep('done')
      onCreated(lineItems, selectedClient, dueDate)
      setTimeout(reset, 1800)
    } finally {
      setSaving(false)
    }
  }

  const total = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{ width: '100%', borderRadius: 16, border: '2px dashed #d4d0ec', background: 'linear-gradient(135deg, #f8f7fd 0%, #f0eef9 100%)', padding: '20px 22px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 14 }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#534AB7'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#d4d0ec'; e.currentTarget.style.transform = 'none' }}
      >
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px #534AB720', flexShrink: 0 }}>
          <span style={{ fontSize: 20 }}>✨</span>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Create an invoice</p>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>Just describe the work — we&apos;ll handle the rest</p>
        </div>
        <span style={{ marginLeft: 'auto', color: '#534AB7', fontSize: 18 }}>→</span>
      </button>
    )
  }

  return (
    <div style={{ borderRadius: 16, border: '1px solid #e5e3f1', background: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', background: 'linear-gradient(90deg, #534AB7, #6C63FF)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            {step === 'prompt' ? 'New Invoice' : step === 'review' ? 'Review & Send' : 'Done!'}
          </span>
        </div>
        <button onClick={reset} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {step === 'prompt' && (
        <div style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 5 }}>Who&apos;s this for?</label>
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ width: '100%', borderRadius: 10, border: '1px solid #e0ddd5', background: '#fafaf8', padding: '10px 12px', fontSize: 13, outline: 'none' }}>
              <option value="">Choose a client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 5 }}>What did you do?</label>
            <textarea
              ref={textRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={PLACEHOLDER_PROMPTS[phIdx]}
              rows={3}
              style={{ width: '100%', borderRadius: 10, border: '1px solid #e0ddd5', background: '#fafaf8', padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) simulateParse() }}
            />
            <p style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>Describe the work, hours, rates — we&apos;ll turn it into a professional invoice.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{ borderRadius: 10, border: '1px solid #e0ddd5', background: 'none', padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#666', cursor: 'pointer' }}>Cancel</button>
            <button
              onClick={simulateParse}
              disabled={loading || !prompt.trim() || !selectedClient}
              style={{ borderRadius: 10, border: 'none', background: (!prompt.trim() || !selectedClient) ? '#ccc' : '#534AB7', padding: '9px 20px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: (!prompt.trim() || !selectedClient) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px #534AB720' }}
            >
              {loading ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> : '✨'}
              {loading ? 'Reading…' : 'Generate invoice'}
            </button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 10, background: '#f8f7fd', padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{clients.find(c => c.id === selectedClient)?.name}</p>
            <button onClick={() => setStep('prompt')} style={{ fontSize: 11, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>← Edit</button>
          </div>
          <div style={{ borderRadius: 12, border: '1px solid #e5e3f1', overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8f7fd' }}>
                  {['Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                    <th key={h} style={{ textAlign: i > 0 ? 'right' : 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, width: i > 0 ? (i === 0 ? undefined : i === 1 ? 60 : 90) : undefined }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f0eef9' }}>
                    <td style={{ padding: '10px 12px' }}>{item.description}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#888' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#888' }}>{fmtFull(item.unitPrice)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#534AB7' }}>{fmtFull(item.quantity * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #e5e3f1', background: '#f8f7fd' }}>
                  <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmtFull(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4 }}>Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ borderRadius: 10, border: '1px solid #e0ddd5', background: '#fafaf8', padding: '8px 12px', fontSize: 13, outline: 'none' }} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={reset} style={{ borderRadius: 10, border: '1px solid #e0ddd5', background: 'none', padding: '10px 16px', fontSize: 13, fontWeight: 500, color: '#666', cursor: 'pointer' }}>Cancel</button>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleCreate}
              disabled={saving}
              style={{ borderRadius: 10, border: 'none', background: '#534AB7', padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px #534AB720', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? '…' : '✓'} {saving ? 'Creating…' : `Create invoice ${fmtFull(total)}`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 24 }}>✓</div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Invoice created!</p>
          <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>It&apos;s been added to your invoices</p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  InvoicePreviewModal                                                 */
/* ------------------------------------------------------------------ */

interface PaymentSuggestion {
  id: string
  confidence: string
  reasoning: string
  transaction: { id: string; description: string; date: string; amount: number }
}

function InvoicePreviewModal({ inv: initial, clientId, clientName, clientSlug, onClose, onUpdated, onSuggestionActioned }: {
  inv: Invoice
  clientId: string
  clientName: string
  clientSlug: string
  onClose: () => void
  onUpdated?: (inv: Invoice) => void
  onSuggestionActioned?: (transactionId: string) => void
}) {
  const router = useRouter()
  const [inv, setInv] = useState(initial)
  const balance = inv.total - inv.paid
  const ds = getDisplayStatus(inv)
  const isOverdue = ds === 'OVERDUE'

  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [nudged, setNudged] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [suggestions, setSuggestions] = useState<PaymentSuggestion[]>([])
  const [suggestionsDone, setSuggestionsDone] = useState<Record<string, 'accepted' | 'dismissed'>>({})
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Fetch suggestions when modal opens for relevant statuses
  useEffect(() => {
    if (!['SENT', 'PARTIAL', 'OVERDUE'].includes(inv.status)) return
    setLoadingSuggestions(true)
    fetch(`/api/invoice-payment-suggestions?invoiceId=${inv.id}`)
      .then(r => r.json())
      .then(j => { if (j.data) setSuggestions(j.data) })
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false))
  }, [inv.id, inv.status])

  async function handleSend() {
    setSending(true)
    const res = await fetch(`/api/projects/${clientId}/invoices/${inv.id}/send`, { method: 'POST' })
    setSending(false)
    if (res.ok) setSent(true)
  }

  async function handleNudge() {
    setNudging(true)
    const res = await fetch(`/api/projects/${clientId}/invoices/${inv.id}/remind`, { method: 'POST' })
    setNudging(false)
    if (res.ok) setNudged(true)
  }

  async function handleDelete() {
    if (!confirm('Delete this draft? This cannot be undone.')) return
    setDeleting(true)
    const res = await fetch(`/api/projects/${clientId}/invoices/${inv.id}`, { method: 'DELETE' })
    if (res.ok) { onClose(); router.refresh() }
    else setDeleting(false)
  }

  async function handleVoid() {
    if (!confirm('Void this invoice? This cannot be undone.')) return
    setVoiding(true)
    const res = await fetch(`/api/projects/${clientId}/invoices/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VOID' }),
    })
    if (res.ok) {
      const j = await res.json()
      const updated = { ...inv, status: 'VOID', ...j.data }
      setInv(updated)
      onUpdated?.(updated)
    }
    setVoiding(false)
  }

  async function handleSuggestion(suggestion: PaymentSuggestion, action: 'accept' | 'dismiss') {
    const { id: suggestionId, transaction: { id: transactionId } } = suggestion
    setSuggestionsDone(p => ({ ...p, [suggestionId]: action === 'accept' ? 'accepted' : 'dismissed' }))
    const res = await fetch('/api/invoice-payment-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId, action }),
    })
    if (res.ok) onSuggestionActioned?.(transactionId)
    if (res.ok && action === 'accept') {
      // Re-fetch invoice to get updated status/paid amount
      const invRes = await fetch(`/api/projects/${clientId}/invoices/${inv.id}`)
      if (invRes.ok) {
        const j = await invRes.json()
        const raw = j.data
        // API returns payments array; compute paid total to match modal's Invoice shape
        const paid = Array.isArray(raw.payments)
          ? raw.payments.reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0)
          : raw.paid ?? inv.paid
        const updated = { ...inv, status: raw.status, paid }
        setInv(updated)
        onUpdated?.(updated)
      }
    }
  }

  const headerBg = isOverdue
    ? 'linear-gradient(135deg, #fef2f2, #fff1f2)'
    : ds === 'PAID' ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)'
    : ds === 'DRAFT' ? 'linear-gradient(135deg, #fafaf8, #f5f4f0)'
    : 'linear-gradient(135deg, #f8f7fd, #f3f1fb)'

  const activeSuggestions = suggestions.filter(s => !suggestionsDone[s.id])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', width: 620, maxHeight: '90vh', overflowY: 'auto', borderRadius: 20, background: '#fff', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '28px 32px', background: headerBg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a1a', letterSpacing: -0.5 }}>{inv.invoiceNumber}</h2>
                <StatusBadge status={ds} />
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
                For <strong style={{ color: '#555' }}>{clientName}</strong>
                {inv.jobName && <> · {inv.jobName}</>}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
                {fmt(balance > 0 ? balance : inv.total, inv.currency)}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>
                {balance <= 0 && inv.paid > 0 ? 'Paid in full' : ds === 'VOID' ? 'Voided' : 'Amount due'}
              </p>
            </div>
          </div>
          {isOverdue && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, borderRadius: 10, background: 'rgba(239,68,68,0.08)', padding: '8px 12px' }}>
              <span style={{ fontSize: 14 }}>⏰</span>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#dc2626' }}>{daysAgo(inv.dueDate)} days overdue</p>
            </div>
          )}
        </div>

        {/* Meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #f0eeeb' }}>
          {[
            { label: 'Issued',   value: new Date(inv.issueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) },
            { label: 'Due',      value: new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) },
            { label: 'Currency', value: inv.currency },
          ].map((m, i) => (
            <div key={m.label} style={{ padding: '14px 32px', borderRight: i < 2 ? '1px solid #f0eeeb' : 'none' }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{m.label}</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: m.label === 'Due' && isOverdue ? '#dc2626' : '#1a1a1a' }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Line items */}
        <div style={{ padding: '22px 32px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1a1a1a' }}>
                {['Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                  <th key={h} style={{ textAlign: i > 0 ? 'right' : 'left', paddingBottom: 8, fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f5f4f0' }}>
                <td style={{ padding: '12px 0' }}>{inv.jobName ?? 'Services rendered'}</td>
                <td style={{ padding: '12px 0', textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>1</td>
                <td style={{ padding: '12px 0', textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>{fmtFull(inv.total, inv.currency)}</td>
                <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtFull(inv.total, inv.currency)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #1a1a1a' }}>
                <td colSpan={3} style={{ padding: '12px 0', textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#888', textTransform: 'uppercase' }}>Total</td>
                <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 800, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{fmtFull(inv.total, inv.currency)}</td>
              </tr>
              {inv.paid > 0 && (
                <>
                  <tr>
                    <td colSpan={3} style={{ paddingTop: 4, textAlign: 'right', fontSize: 12, color: '#16a34a', fontWeight: 500 }}>Paid</td>
                    <td style={{ paddingTop: 4, textAlign: 'right', color: '#16a34a', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>−{fmtFull(inv.paid, inv.currency)}</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid #e8e6df' }}>
                    <td colSpan={3} style={{ padding: '10px 0', textAlign: 'right', fontWeight: 800 }}>Balance due</td>
                    <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 800, fontSize: 16, color: balance <= 0 ? '#16a34a' : '#1a1a1a', fontVariantNumeric: 'tabular-nums' }}>{fmtFull(Math.max(balance, 0), inv.currency)}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>

        {/* Payment match suggestions */}
        {loadingSuggestions && (
          <div style={{ padding: '0 32px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #d4d0ec', borderTopColor: '#534AB7', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#aaa' }}>Checking for payment matches…</span>
          </div>
        )}
        {activeSuggestions.length > 0 && (
          <div style={{ padding: '0 32px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeSuggestions.map(s => (
              <div key={s.id} style={{ borderRadius: 12, border: '1px solid #bfdbfe', background: '#eff6ff', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>💳 Possible payment match</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#3b82f6', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtFull(s.transaction.amount, inv.currency)} · {s.transaction.description} · {new Date(s.transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#60a5fa' }}>{s.reasoning}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleSuggestion(s, 'accept')}
                      style={{ borderRadius: 8, border: 'none', background: '#2563eb', padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleSuggestion(s, 'dismiss')}
                      style={{ borderRadius: 8, border: '1px solid #93c5fd', background: 'none', padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions footer */}
        <div style={{ display: 'flex', gap: 8, padding: '0 32px 24px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href={`/projects/${clientSlug}/invoices/${inv.id}`}
            style={{ fontSize: 12, color: '#534AB7', textDecoration: 'none', fontWeight: 500 }}
          >
            Full details →
          </Link>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Destructive: delete draft */}
            {ds === 'DRAFT' && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ borderRadius: 10, border: '1px solid #fca5a5', background: 'none', padding: '8px 14px', fontSize: 12, fontWeight: 500, color: '#dc2626', cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.5 : 1 }}
              >
                {deleting ? '…' : 'Delete'}
              </button>
            )}
            {/* Void for non-draft non-paid */}
            {!['DRAFT', 'PAID', 'VOID'].includes(ds) && (
              <button
                onClick={handleVoid}
                disabled={voiding}
                style={{ borderRadius: 10, border: '1px solid #e0ddd5', background: 'none', padding: '8px 14px', fontSize: 12, fontWeight: 500, color: '#888', cursor: voiding ? 'default' : 'pointer', opacity: voiding ? 0.5 : 1 }}
              >
                {voiding ? '…' : 'Void'}
              </button>
            )}
            <button onClick={onClose} style={{ borderRadius: 10, border: '1px solid #e0ddd5', background: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 500, color: '#666', cursor: 'pointer' }}>Close</button>
            {/* Primary CTA depends on status */}
            {ds === 'DRAFT' && (
              <button
                onClick={handleSend}
                disabled={sending || sent}
                style={{ borderRadius: 10, border: 'none', background: sent ? '#16a34a' : '#534AB7', padding: '8px 18px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: sending || sent ? 'default' : 'pointer', transition: 'all 0.2s' }}
              >
                {sent ? '✓ Sent!' : sending ? '…' : '📧 Send to client'}
              </button>
            )}
            {(ds === 'SENT' || ds === 'PARTIAL' || ds === 'OVERDUE') && (
              <button
                onClick={handleNudge}
                disabled={nudging || nudged}
                style={{ borderRadius: 10, border: 'none', background: nudged ? '#16a34a' : isOverdue ? '#dc2626' : '#f59e0b', padding: '8px 18px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: nudging || nudged ? 'default' : 'pointer' }}
              >
                {nudged ? '✓ Sent!' : nudging ? '…' : '🔔 Send reminder'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

type FlatInvoice = Invoice & { clientId: string; clientName: string; clientSlug: string; clientCompany: string | null }

export function StudioClient({ clients, kpis: initialKpis, paymentMethods, pendingSuggestions = 0, recentPaymentsCount = 0, invoiceDefaults, isOnboarding = false, hasOverheadWorkspace = true }: Props) {
  const router = useRouter()
  const [view, setView] = useState<View>('open')
  const [search, setSearch] = useState('')
  const [previewInv, setPreviewInv] = useState<FlatInvoice | null>(null)
  const [kpis, setKpis] = useState(initialKpis)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [showNewJobModal, setShowNewJobModal] = useState(false)
  const [showNewEstimateModal, setShowNewEstimateModal] = useState(false)
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false)
  const [showLogTimeModal, setShowLogTimeModal] = useState(false)
  const [actionFilter, setActionFilter] = useState<((i: FlatInvoice) => boolean) | null>(null)
  const [suggestionInvoiceIds, setSuggestionInvoiceIds] = useState<Set<string>>(new Set())
  const [suggestionTxCount, setSuggestionTxCount] = useState(pendingSuggestions)

  // Fetch which invoice IDs have pending suggestions so we can filter precisely
  useEffect(() => {
    if (pendingSuggestions === 0) return
    fetch('/api/invoice-payment-suggestions')
      .then(r => r.json())
      .then(j => {
        if (j.data) {
          const data = j.data as { invoice: { id: string }; transaction: { id: string } }[]
          setSuggestionInvoiceIds(new Set(data.map(s => s.invoice.id)))
          setSuggestionTxCount(new Set(data.map(s => s.transaction.id)).size)
        }
      })
      .catch(() => {})
  }, [pendingSuggestions])

  const flat: FlatInvoice[] = useMemo(() =>
    clients.flatMap(c =>
      c.invoices.map(inv => ({
        ...inv,
        clientId: c.id,
        clientName: c.name,
        clientSlug: c.slug,
        clientCompany: c.company,
      }))
    ),
    [clients]
  )

  const filtered = useMemo(() => {
    let result = flat
    if (actionFilter) return result.filter(actionFilter)
    if (view === 'open') result = result.filter(i => { const s = getDisplayStatus(i); return s !== 'PAID' && s !== 'VOID' })
    else if (view === 'paid') result = result.filter(i => getDisplayStatus(i) === 'PAID')
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(i =>
        i.clientName.toLowerCase().includes(q) ||
        i.invoiceNumber.toLowerCase().includes(q) ||
        (i.jobName ?? '').toLowerCase().includes(q)
      )
    }
    return result
  }, [flat, view, search, actionFilter])

  const actions = useMemo(() => {
    const items: { icon: string; label: string; detail: string; color: 'red' | 'amber' | 'blue'; filterFn: (i: FlatInvoice) => boolean }[] = []
    const overdue = flat.filter(i => getDisplayStatus(i) === 'OVERDUE')
    if (overdue.length > 0) items.push({ icon: '⚠️', label: `${overdue.length} overdue invoice${overdue.length !== 1 ? 's' : ''}`, detail: `${fmt(overdue.reduce((s, i) => s + (i.total - i.paid), 0))} needs collecting`, color: 'red', filterFn: i => getDisplayStatus(i) === 'OVERDUE' })
    const drafts = flat.filter(i => i.status === 'DRAFT')
    if (drafts.length > 0) items.push({ icon: '📨', label: `${drafts.length} draft${drafts.length !== 1 ? 's' : ''} ready to send`, detail: `${fmt(drafts.reduce((s, i) => s + i.total, 0))} in unsent invoices`, color: 'blue', filterFn: i => i.status === 'DRAFT' })
    // Note: payment suggestions live in the transactions view, not here — handled separately via onReviewSuggestions
    return items
  }, [flat])

  const tabCounts = useMemo(() => ({
    open: flat.filter(i => { const s = getDisplayStatus(i); return s !== 'PAID' && s !== 'VOID' }).length,
    paid: flat.filter(i => getDisplayStatus(i) === 'PAID').length,
    all:  flat.length,
  }), [flat])

  if (clients.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No active clients</p>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>Create a client project and start issuing invoices.</p>
        <Link href="/projects/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, background: '#534AB7', padding: '10px 20px', fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
          Add client
        </Link>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'inherit', maxWidth: 960, color: '#1a1a1a' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Onboarding banner */}
      {isOnboarding && clients.length === 0 && (
        <OnboardingBanner
          message="Add your first client to start tracking invoices and jobs."
          actionLabel="Add Client"
          actionHref="/projects/new?type=CLIENT"
          onSkip={() => router.replace('/studio')}
        />
      )}

      {/* Overhead workspace prompt for existing users */}
      {!isOnboarding && !hasOverheadWorkspace && (
        <ActionBanner
          icon="📌"
          label="Track business overhead"
          detail="Set up a shared workspace for expenses not tied to a specific client — subscriptions, equipment, office costs."
          color="blue"
          onClick={() => router.push('/projects/new?type=OTHER&overhead=1')}
          cta="Set up →"
        />
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Earned this month"  value={fmt(kpis.revenueThisMonth)}  color="green" />
        <KpiCard label="Outstanding"        value={fmt(kpis.totalOutstanding)}  sub={`${kpis.openInvoices} open`} color={kpis.totalOutstanding > 0 ? 'amber' : 'neutral'} />
        <KpiCard label="Overdue"            value={kpis.overdueCount}           sub={kpis.overdueCount > 0 ? 'Needs attention' : ''} color={kpis.overdueCount > 0 ? 'red' : 'neutral'} />
        <KpiCard label="Clients"            value={kpis.activeClients}          sub="active" color="neutral" />
      </div>

      {/* Take action + Aging */}
      <div style={{ display: 'grid', gridTemplateColumns: kpis.totalOutstanding > 0 ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 20 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Take action */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>Take action</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                onClick={() => { setActionFilter(null); setShowInvoiceModal(true) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, border: 'none', background: '#534AB7', padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
              >
                <Plus size={11} />
                Draft new invoice
              </button>
              <button
                onClick={() => setShowNewClientModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, border: '1.5px solid #534AB7', background: 'transparent', padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#534AB7', cursor: 'pointer' }}
              >
                <Plus size={11} />
                New client
              </button>
              <button
                onClick={() => setShowNewJobModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, border: '1.5px solid #888', background: 'transparent', padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#555', cursor: 'pointer' }}
              >
                <Plus size={11} />
                New job
              </button>
              <button
                onClick={() => setShowNewEstimateModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, border: '1.5px solid #888', background: 'transparent', padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#555', cursor: 'pointer' }}
              >
                <Plus size={11} />
                New estimate
              </button>
              <button
                onClick={() => setShowNewQuoteModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, border: '1.5px solid #888', background: 'transparent', padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#555', cursor: 'pointer' }}
              >
                <Plus size={11} />
                New quote
              </button>
              <button
                onClick={() => setShowLogTimeModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, border: '1.5px solid #888', background: 'transparent', padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#555', cursor: 'pointer' }}
              >
                <Plus size={11} />
                Log time
              </button>
            </div>
          </div>

          {/* Take notice */}
          {(actions.length > 0 || pendingSuggestions > 0 || recentPaymentsCount > 0) && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>Take notice</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {actions.map((a, i) => (
                  <ActionBanner key={i} {...a} onClick={() => { setActionFilter(() => a.filterFn); setView('all') }} />
                ))}
                {pendingSuggestions > 0 && (
                  <ActionBanner
                    icon="💳"
                    label={`${suggestionTxCount} payment match${suggestionTxCount !== 1 ? 'es' : ''} to review`}
                    detail="Open the relevant invoice to accept or dismiss"
                    color="blue"
                    cta="Show invoices →"
                    onClick={() => { setActionFilter(() => (i: FlatInvoice) => suggestionInvoiceIds.has(i.id)); setView('all') }}
                  />
                )}
                {recentPaymentsCount > 0 && (
                  <ActionBanner
                    icon="✅"
                    label={`${recentPaymentsCount} payment${recentPaymentsCount !== 1 ? 's' : ''} received in the last 7 days`}
                    detail="View paid invoices to confirm everything looks right"
                    color="blue"
                    cta="View paid →"
                    onClick={() => { setActionFilter(null); setView('paid') }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Clear filter — shown below the banners when active */}
          {actionFilter && (
            <button
              onClick={() => setActionFilter(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid #e0ddd5', background: '#fff', padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#555', cursor: 'pointer', width: 'fit-content' }}
            >
              ✕ Clear filter
            </button>
          )}
        </div>

        {kpis.totalOutstanding > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>Money owed to you</p>
            <AgingBar invoices={flat} />
          </div>
        )}
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 3, borderRadius: 10, background: '#f5f4f0', padding: 3 }}>
          {([
            { key: 'open', label: 'Open', count: tabCounts.open },
            { key: 'paid', label: 'Paid', count: tabCounts.paid },
            { key: 'all',  label: 'All',  count: tabCounts.all  },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActionFilter(null); setView(tab.key) }}
              style={{ borderRadius: 8, border: 'none', background: view === tab.key ? '#fff' : 'transparent', boxShadow: view === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', padding: '6px 12px', fontSize: 12, fontWeight: view === tab.key ? 600 : 500, color: view === tab.key ? '#1a1a1a' : '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {tab.label}
              <span style={{ borderRadius: 99, padding: '0 6px', fontSize: 10, fontWeight: 700, background: view === tab.key ? '#f0eef9' : 'transparent', color: view === tab.key ? '#534AB7' : '#bbb', fontVariantNumeric: 'tabular-nums' }}>{tab.count}</span>
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', width: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#bbb' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ width: '100%', borderRadius: 10, border: '1px solid #e8e6df', background: '#fafaf8', padding: '6px 12px 6px 30px', fontSize: 12, outline: 'none' }}
          />
        </div>
      </div>

      {/* Invoice Table */}
      {filtered.length === 0 ? (
        <div style={{ borderRadius: 14, border: '2px dashed #e0ddd5', padding: '48px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#aaa' }}>
            {search ? 'No invoices match.' : view === 'paid' ? 'No paid invoices yet.' : 'Nothing needs attention — you\'re all caught up! 🎉'}
          </p>
        </div>
      ) : (
        <div style={{ borderRadius: 14, border: '1px solid #e8e6df', overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 90px 90px 80px 60px', padding: '8px 16px', background: '#fafaf8', borderBottom: '1px solid #e8e6df' }}>
            {['Client', 'Invoice', 'Job', 'Amount', 'Balance', 'Status', ''].map((h, i) => (
              <span key={h || i} style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: (i === 3 || i === 4) ? 'right' : 'left', whiteSpace: 'nowrap', paddingLeft: i > 0 ? 16 : 0 }}>{h}</span>
            ))}
          </div>
          {filtered.map((inv, idx) => {
            const ds = getDisplayStatus(inv)
            const balance = inv.total - inv.paid
            const isOverdue = ds === 'OVERDUE'
            const isDraft = inv.status === 'DRAFT'
            const prevInv = idx > 0 ? filtered[idx - 1] : null
            const isNewClient = !prevInv || prevInv.clientId !== inv.clientId
            const days = daysUntil(inv.dueDate)

            return (
              <div
                key={inv.id}
                onClick={() => setPreviewInv(inv)}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 90px 90px 80px 60px', padding: '0 16px', alignItems: 'center', borderBottom: '1px solid #f5f4f0', cursor: 'pointer', background: isOverdue ? 'rgba(254,226,226,0.15)' : 'transparent', transition: 'background 0.15s' }}
                onMouseEnter={e => { if (!isOverdue) (e.currentTarget as HTMLDivElement).style.background = '#fafaf8' }}
                onMouseLeave={e => { if (!isOverdue) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{ padding: '10px 8px 10px 0', minWidth: 0 }}>
                  {isNewClient ? (
                    <Link
                      href={`/projects/${inv.clientSlug}`}
                      onClick={e => e.stopPropagation()}
                      style={{ textDecoration: 'none', display: 'block', minWidth: 0 }}
                    >
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1a1a1a' }}>{inv.clientName}</p>
                      {inv.clientCompany && <p style={{ margin: 0, fontSize: 10, color: '#aaa' }}>{inv.clientCompany}</p>}
                    </Link>
                  ) : <span style={{ fontSize: 10, color: '#ccc', paddingLeft: 4 }}>↳</span>}
                </div>
                <div style={{ padding: '10px 0 10px 16px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#534AB7', fontVariantNumeric: 'tabular-nums' }}>{inv.invoiceNumber}</span>
                </div>
                <div style={{ padding: '10px 0 10px 16px', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ fontSize: 13, color: '#888' }}>{inv.jobName ?? '—'}</span>
                </div>
                <div style={{ padding: '10px 0 10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.total, inv.currency)}</span>
                </div>
                <div style={{ padding: '10px 0 10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {ds === 'PAID' ? <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>Paid</span>
                    : ds === 'VOID' ? <span style={{ fontSize: 13, color: '#ccc' }}>Void</span>
                    : balance > 0 ? <span style={{ fontSize: 13, fontWeight: 700, color: isOverdue ? '#dc2626' : '#a16207', fontVariantNumeric: 'tabular-nums' }}>{fmt(balance, inv.currency)}</span>
                    : <span style={{ color: '#ccc' }}>—</span>}
                </div>
                <div style={{ padding: '10px 0 10px 16px', whiteSpace: 'nowrap' }}>
                  <StatusBadge status={ds} />
                  {isOverdue && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 600, marginLeft: 4 }}>{daysAgo(inv.dueDate)}d</span>}
                  {!isOverdue && ds === 'SENT' && days >= 0 && days <= 7 && <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 4 }}>{days}d</span>}
                </div>
                <div style={{ padding: '10px 0 10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                  {isDraft && (
                    <button
                      onClick={async e => {
                        e.stopPropagation()
                        await fetch(`/api/projects/${inv.clientId}/invoices/${inv.id}/send`, { method: 'POST' })
                      }}
                      style={{ borderRadius: 6, border: 'none', background: '#534AB7', padding: '3px 8px', fontSize: 10, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                    >
                      Send
                    </button>
                  )}
                  {isOverdue && (
                    <button
                      onClick={async e => {
                        e.stopPropagation()
                        await fetch(`/api/projects/${inv.clientId}/invoices/${inv.id}/remind`, { method: 'POST' })
                      }}
                      style={{ borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', padding: '3px 8px', fontSize: 10, fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}
                    >
                      Nudge
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewInv && (
        <InvoicePreviewModal
          inv={previewInv}
          clientId={previewInv.clientId}
          clientName={previewInv.clientName}
          clientSlug={previewInv.clientSlug}
          onClose={() => setPreviewInv(null)}
          onUpdated={updated => setPreviewInv(p => p ? { ...p, ...updated } : p)}
          onSuggestionActioned={transactionId => {
            setSuggestionInvoiceIds(prev => {
              // Re-fetch to get accurate state; optimistically remove acted-on tx's invoices
              fetch('/api/invoice-payment-suggestions')
                .then(r => r.json())
                .then(j => {
                  if (j.data) {
                    const data = j.data as { invoice: { id: string }; transaction: { id: string } }[]
                    setSuggestionInvoiceIds(new Set(data.map(s => s.invoice.id)))
                    setSuggestionTxCount(new Set(data.map(s => s.transaction.id)).size)
                  } else {
                    setSuggestionTxCount(0)
                  }
                })
                .catch(() => {})
              return prev
            })
          }}
        />
      )}

      {/* Studio invoice creation modal */}
      {showInvoiceModal && (
        <StudioInvoiceModal
          clients={clients}
          paymentMethods={paymentMethods}
          invoiceDefaults={invoiceDefaults}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}
      {showNewClientModal && (
        <NewClientModal
          onClose={() => setShowNewClientModal(false)}
          onCreated={({ slug }) => { setShowNewClientModal(false); router.push(`/projects/${slug}`) }}
        />
      )}
      {showNewJobModal && (
        <NewJobModal
          clients={clients.map(c => ({ id: c.id, name: c.name }))}
          onClose={() => setShowNewJobModal(false)}
          onCreated={() => { setShowNewJobModal(false); router.refresh() }}
        />
      )}
      {showNewEstimateModal && (
        <NewEstimateModal
          clients={clients.map(c => ({ id: c.id, name: c.name, slug: c.slug }))}
          onClose={() => setShowNewEstimateModal(false)}
        />
      )}
      {showNewQuoteModal && (
        <NewQuoteModal
          clients={clients.map(c => ({ id: c.id, name: c.name, slug: c.slug }))}
          onClose={() => setShowNewQuoteModal(false)}
        />
      )}
      {showLogTimeModal && (
        <LogTimeModal
          clients={clients.map(c => ({ id: c.id, name: c.name, slug: c.slug, jobs: c.jobs }))}
          onClose={() => setShowLogTimeModal(false)}
        />
      )}
    </div>
  )
}

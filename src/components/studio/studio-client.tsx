'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { StudioInvoiceModal } from '@/components/studio/studio-invoice-modal'
import { NewClientModal, NewJobModal, NewEstimateModal, NewQuoteModal, LogTimeModal } from '@/components/studio/studio-action-modals'
import { MarkSentModal } from '@/components/studio/mark-sent-modal'
import { MarkSentQuoteModal } from '@/components/studio/mark-sent-quote-modal'
import { NewWorkOrderModal } from '@/components/work-orders/new-work-order-modal'
import { IntakeBillModal } from '@/components/work-orders/intake-bill-modal'
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
  acceptedQuotes: { id: string; quoteNumber: string; title: string; totalQuoted: number | null; currency: string; hasInvoice: boolean; jobName: string | null }[]
  sentQuotes: { id: string; quoteNumber: string; title: string; totalQuoted: number | null; currency: string; sentAt: string | null; jobName: string | null }[]
  receiptCount: number
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
  hasTransactions?: boolean
}

type View = 'open' | 'paid' | 'all'

interface PendingMarkSentItem {
  invoiceId: string
  invoiceNumber: string
  projectId: string
  projectSlug: string
  downloadedAt: number
}

interface PendingMarkSentQuoteItem {
  quoteId: string
  quoteNumber: string
  projectId: string
  projectSlug: string
  downloadedAt: number
}

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

function KpiCard({ label, value, sub, color, onClick, active }: { label: string; value: string | number; sub?: string; color: 'green' | 'amber' | 'red' | 'neutral'; onClick?: () => void; active?: boolean }) {
  const colors = {
    green:   { border: '#bbf7d0', bg: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', text: '#15803d' },
    amber:   { border: '#fde68a', bg: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)', text: '#a16207' },
    red:     { border: '#fecaca', bg: 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)', text: '#dc2626' },
    neutral: { border: '#e8e6df', bg: '#fafaf8', text: '#1a1a1a' },
  }
  const c = colors[color]
  return (
    <div
      onClick={onClick}
      style={{ borderRadius: 10, border: `1.5px solid ${active ? c.text : c.border}`, background: c.bg, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.15s, box-shadow 0.15s', boxShadow: active ? `0 0 0 3px ${c.text}18` : 'none' }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = c.text }}
      onMouseLeave={e => { if (onClick && !active) (e.currentTarget as HTMLDivElement).style.borderColor = c.border }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, color: '#888', margin: 0, lineHeight: 1.3 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1, margin: 0 }}>{value}</p>
        {sub && <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>{sub}</p>}
        {onClick && <span style={{ marginLeft: 'auto', fontSize: 10, color: c.text, opacity: 0.6 }}>↓</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  PipelineStrip                                                       */
/* ------------------------------------------------------------------ */

interface PipelineStage {
  label: string
  amount: number
  count: number
  color: string
  textColor: string
}

function PipelineStrip({ clients, flat }: { clients: Client[]; flat: (Invoice & { clientId: string })[] }) {
  const stages = useMemo((): PipelineStage[] => {
    const acceptedQuotesTotal = clients.reduce((s, c) => s + c.acceptedQuotes.reduce((qs, q) => qs + (q.totalQuoted ?? 0), 0), 0)
    const acceptedQuotesCount = clients.reduce((s, c) => s + c.acceptedQuotes.length, 0)

    const invoiced = flat.filter(i => {
      const s = getDisplayStatus(i)
      return s === 'DRAFT' || s === 'SENT' || s === 'PARTIAL'
    })
    const overdue = flat.filter(i => getDisplayStatus(i) === 'OVERDUE')
    const collected = flat.filter(i => getDisplayStatus(i) === 'PAID')

    return [
      {
        label: 'Accepted quotes',
        amount: acceptedQuotesTotal,
        count: acceptedQuotesCount,
        color: '#eeedfe',
        textColor: '#534AB7',
      },
      {
        label: 'Invoiced',
        amount: invoiced.reduce((s, i) => s + (i.total - i.paid), 0),
        count: invoiced.length,
        color: '#fef3c7',
        textColor: '#a16207',
      },
      {
        label: 'Overdue',
        amount: overdue.reduce((s, i) => s + (i.total - i.paid), 0),
        count: overdue.length,
        color: '#fee2e2',
        textColor: '#dc2626',
      },
      {
        label: 'Collected',
        amount: collected.reduce((s, i) => s + i.paid, 0),
        count: collected.length,
        color: '#d1fae5',
        textColor: '#065f46',
      },
    ]
  }, [clients, flat])

  const hasAnyData = stages.some(s => s.count > 0)
  if (!hasAnyData) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1, marginBottom: 20, borderRadius: 14, overflow: 'hidden', border: '1px solid #e8e6df' }}>
      {stages.map((stage, i) => (
        <div
          key={stage.label}
          style={{
            background: stage.count > 0 ? stage.color : '#fafaf8',
            padding: '14px 18px',
            borderRight: i < 3 ? '1px solid #e8e6df' : 'none',
            opacity: stage.count === 0 ? 0.5 : 1,
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 700, color: stage.count > 0 ? stage.textColor : '#bbb', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 6px' }}>{stage.label}</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: stage.count > 0 ? stage.textColor : '#ccc', fontVariantNumeric: 'tabular-nums', margin: '0 0 2px', lineHeight: 1.1 }}>
            {stage.amount > 0 ? fmt(stage.amount) : '—'}
          </p>
          <p style={{ fontSize: 10, color: stage.count > 0 ? stage.textColor : '#ccc', margin: 0, opacity: 0.7 }}>
            {stage.count} {stage.count === 1 ? (stage.label === 'Collected' ? 'invoice' : stage.label === 'Accepted quotes' ? 'quote' : 'invoice') : (stage.label === 'Accepted quotes' ? 'quotes' : 'invoices')}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  RecentActivity                                                      */
/* ------------------------------------------------------------------ */

interface ActivityItem {
  time: string
  event: string
  clientName: string
  clientSlug: string
  color: string
}

function deriveRecentActivity(clients: Client[], flat: (Invoice & { clientId: string; clientName: string; clientSlug: string })[]): ActivityItem[] {
  const items: (ActivityItem & { _date: Date })[] = []

  // Build a color map for clients
  const clientColors = ['#534AB7', '#1D9E75', '#D85A30', '#D4537E', '#378ADD', '#BA7517']
  const colorMap: Record<string, string> = {}
  clients.forEach((c, i) => { colorMap[c.id] = clientColors[i % clientColors.length] })

  for (const inv of flat) {
    const issueDate = new Date(inv.issueDate)
    const clientName = inv.clientName
    const clientSlug = inv.clientSlug
    const color = colorMap[inv.clientId] ?? '#888'

    if (inv.status === 'DRAFT') {
      items.push({ _date: issueDate, time: formatRelativeDate(issueDate), event: `Invoice ${inv.invoiceNumber} drafted`, clientName, clientSlug, color })
    } else if (inv.status === 'SENT' || inv.status === 'PARTIAL') {
      items.push({ _date: issueDate, time: formatRelativeDate(issueDate), event: `Invoice ${inv.invoiceNumber} sent`, clientName, clientSlug, color })
    } else if (inv.status === 'PAID') {
      items.push({ _date: issueDate, time: formatRelativeDate(issueDate), event: `Invoice ${inv.invoiceNumber} paid`, clientName, clientSlug, color })
    }
  }

  // Sort by date desc, take top 6
  items.sort((a, b) => b._date.getTime() - a._date.getTime())
  return items.slice(0, 6).map(({ _date: _d, ...rest }) => rest)
}

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
/*  Main                                                                */
/* ------------------------------------------------------------------ */

type FlatInvoice = Invoice & { clientId: string; clientName: string; clientSlug: string; clientCompany: string | null }

export function StudioClient({ clients, kpis: initialKpis, paymentMethods, pendingSuggestions = 0, recentPaymentsCount = 0, invoiceDefaults, isOnboarding = false, hasOverheadWorkspace = true, hasTransactions = true }: Props) {
  const router = useRouter()
  const [kpis, setKpis] = useState(initialKpis)
  const [expandedClient, setExpandedClient] = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [clientFilter, setClientFilter] = useState<'outstanding' | 'overdue' | 'unsent' | 'collected' | 'awaiting-quotes' | 'uninvoiced-quotes' | null>(null)
  const [creatingOverhead, setCreatingOverhead] = useState(false)
  const cardsRef = useRef<HTMLDivElement>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [showNewJobModal, setShowNewJobModal] = useState(false)
  const [showNewEstimateModal, setShowNewEstimateModal] = useState(false)
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false)
  const [showLogTimeModal, setShowLogTimeModal] = useState(false)
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false)
  const [showIntakeBillModal, setShowIntakeBillModal] = useState(false)
  const [preselectedClientId, setPreselectedClientId] = useState<string | null>(null)
  const [suggestionTxCount] = useState(pendingSuggestions)
  const [pendingMarkSent, setPendingMarkSent] = useState<PendingMarkSentItem[]>([])
  const [markSentTarget, setMarkSentTarget] = useState<PendingMarkSentItem | null>(null)
  const [pendingMarkSentQuote, setPendingMarkSentQuote] = useState<PendingMarkSentQuoteItem[]>([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [markSentQuoteTarget, setMarkSentQuoteTarget] = useState<PendingMarkSentQuoteItem | null>(null)

  // Load pending mark-as-sent notifications from localStorage on mount
  useEffect(() => {
    try {
      const key = 'pending-mark-sent'
      const raw: PendingMarkSentItem[] = JSON.parse(localStorage.getItem(key) ?? '[]')
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const fresh = raw.filter(item => item.downloadedAt > sevenDaysAgo)
      if (fresh.length !== raw.length) localStorage.setItem(key, JSON.stringify(fresh))
      setPendingMarkSent(fresh)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const key = 'pending-mark-sent-quote'
      const raw: PendingMarkSentQuoteItem[] = JSON.parse(localStorage.getItem(key) ?? '[]')
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const fresh = raw.filter(item => item.downloadedAt > sevenDaysAgo)
      if (fresh.length !== raw.length) localStorage.setItem(key, JSON.stringify(fresh))
      setPendingMarkSentQuote(fresh)
    } catch {}
  }, [])

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

  const notices = useMemo(() => {
    const items: { dot: string; label: string; detail: string; onClick: () => void }[] = []

    // Invoice: overdue
    const overdue = flat.filter(i => getDisplayStatus(i) === 'OVERDUE')
    if (overdue.length > 0) items.push({
      dot: '#ef4444',
      label: `Invoice — ${overdue.length} overdue`,
      detail: `${fmt(overdue.reduce((s, i) => s + (i.total - i.paid), 0))} uncollected`,
      onClick: () => {
        const next: typeof clientFilter = clientFilter === 'overdue' ? null : 'overdue'
        setClientFilter(next)
        if (next) {
          const first = clients.find(c => flat.some(i => i.clientId === c.id && getDisplayStatus(i) === 'OVERDUE'))
          if (first) setExpandedClient(first.id)
        } else setExpandedClient(null)
        setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    // Invoice: unsent drafts
    const drafts = flat.filter(i => i.status === 'DRAFT')
    if (drafts.length > 0) items.push({
      dot: '#3b82f6',
      label: `Invoice — ${drafts.length} draft${drafts.length !== 1 ? 's' : ''} unsent`,
      detail: `${fmt(drafts.reduce((s, i) => s + i.total, 0))} waiting to be sent`,
      onClick: () => {
        const next: typeof clientFilter = clientFilter === 'unsent' ? null : 'unsent'
        setClientFilter(next)
        if (next) {
          const first = clients.find(c => flat.some(i => i.clientId === c.id && i.status === 'DRAFT'))
          if (first) setExpandedClient(first.id)
        } else setExpandedClient(null)
        setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    // Quote: awaiting client acceptance (sent, no response)
    const awaitingAcceptance = clients.flatMap(c => c.sentQuotes.map(q => ({ ...q, clientSlug: c.slug, clientName: c.name })))
    if (awaitingAcceptance.length > 0) items.push({
      dot: '#a78bfa',
      label: `Quote — ${awaitingAcceptance.length} awaiting acceptance`,
      detail: awaitingAcceptance.length === 1
        ? `${awaitingAcceptance[0].quoteNumber} sent to ${awaitingAcceptance[0].clientName}`
        : `Across ${new Set(awaitingAcceptance.map(q => q.clientSlug)).size} client${new Set(awaitingAcceptance.map(q => q.clientSlug)).size !== 1 ? 's' : ''}`,
      onClick: () => {
        const next: typeof clientFilter = clientFilter === 'awaiting-quotes' ? null : 'awaiting-quotes'
        setClientFilter(next)
        if (next) {
          const first = clients.find(c => c.sentQuotes.length > 0)
          if (first) setExpandedClient(first.id)
        } else setExpandedClient(null)
        setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    // Quote: accepted but not yet invoiced
    const uninvoiced = clients.flatMap(c => c.acceptedQuotes.filter(q => !q.hasInvoice).map(q => ({ ...q, clientSlug: c.slug, clientName: c.name })))
    if (uninvoiced.length > 0) items.push({
      dot: '#10b981',
      label: `Quote — ${uninvoiced.length} accepted, not yet invoiced`,
      detail: uninvoiced.length === 1
        ? `${uninvoiced[0].quoteNumber} for ${uninvoiced[0].clientName}`
        : `${fmt(uninvoiced.reduce((s, q) => s + (q.totalQuoted ?? 0), 0))} ready to bill`,
      onClick: () => {
        const next: typeof clientFilter = clientFilter === 'uninvoiced-quotes' ? null : 'uninvoiced-quotes'
        setClientFilter(next)
        if (next) {
          const first = clients.find(c => c.acceptedQuotes.some(q => !q.hasInvoice))
          if (first) setExpandedClient(first.id)
        } else setExpandedClient(null)
        setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    // PDF downloaded but not yet marked as sent
    for (const item of pendingMarkSent) {
      items.push({
        dot: '#6366f1',
        label: `${item.invoiceNumber} — downloaded but not marked sent`,
        detail: 'Click to review and mark as sent',
        onClick: () => setMarkSentTarget(item),
      })
    }

    for (const item of pendingMarkSentQuote) {
      items.push({
        dot: '#a78bfa',
        label: `${item.quoteNumber} — downloaded but not marked sent`,
        detail: 'Click to review and mark as sent',
        onClick: () => setMarkSentQuoteTarget(item),
      })
    }

    return items
  }, [flat, clients, clientFilter, router, pendingMarkSent, pendingMarkSentQuote])

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
          onClick={async () => {
            if (creatingOverhead) return
            setCreatingOverhead(true)
            await fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'Business Overhead', type: 'OTHER', isDefault: true }),
            })
            router.refresh()
          }}
          cta={creatingOverhead ? 'Setting up…' : 'Set up →'}
        />
      )}

      {/* Unified KPI + pipeline row */}
      {(() => {
        const acceptedQuotesTotal = clients.reduce((s, c) => s + c.acceptedQuotes.reduce((qs, q) => qs + (q.totalQuoted ?? 0), 0), 0)
        const acceptedQuotesCount = clients.reduce((s, c) => s + c.acceptedQuotes.length, 0)
        const outstandingInvs = flat.filter(i => { const s = getDisplayStatus(i); return s === 'SENT' || s === 'PARTIAL' || s === 'OVERDUE' })
        const overdueInvs = flat.filter(i => getDisplayStatus(i) === 'OVERDUE')
        const now = new Date()
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
        const startOfYear = new Date(now.getFullYear(), 0, 1)
        const collectedPast30 = flat.filter(i => getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo)
        const collectedYtd = flat.filter(i => getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= startOfYear)
        const outstandingTotal = outstandingInvs.reduce((s, i) => s + (i.total - i.paid), 0)
        const overdueTotal = overdueInvs.reduce((s, i) => s + (i.total - i.paid), 0)
        const collectedPast30Total = collectedPast30.reduce((s, i) => s + i.paid, 0)
        const collectedYtdTotal = collectedYtd.reduce((s, i) => s + i.paid, 0)

        function handleKpiClick(filter: 'outstanding' | 'overdue' | 'collected', matchFn: (c: typeof clients[0]) => boolean) {
          const next = clientFilter === filter ? null : filter
          setClientFilter(next)
          if (next) {
            const first = clients.find(matchFn)
            if (first) setExpandedClient(first.id)
          } else {
            setExpandedClient(null)
          }
          setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
        }

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
            <KpiCard label="Quotes accepted" value={acceptedQuotesCount > 0 ? fmt(acceptedQuotesTotal) : '—'} sub={acceptedQuotesCount > 0 ? `${acceptedQuotesCount} quote${acceptedQuotesCount !== 1 ? 's' : ''}` : 'none active'} color="neutral" />
            <KpiCard
              label="Invoices Outstanding"
              value={outstandingTotal > 0 ? fmt(outstandingTotal) : '—'}
              sub={outstandingInvs.length > 0 ? `${outstandingInvs.length} invoice${outstandingInvs.length !== 1 ? 's' : ''}` : ''}
              color={outstandingTotal > 0 ? 'amber' : 'neutral'}
              active={clientFilter === 'outstanding'}
              onClick={outstandingTotal > 0 ? () => handleKpiClick('outstanding', c => c.outstanding > 0) : undefined}
            />
            <KpiCard
              label="Invoices Overdue"
              value={overdueTotal > 0 ? fmt(overdueTotal) : '—'}
              sub={overdueInvs.length > 0 ? `${overdueInvs.length} invoice${overdueInvs.length !== 1 ? 's' : ''}` : ''}
              color={overdueInvs.length > 0 ? 'red' : 'neutral'}
              active={clientFilter === 'overdue'}
              onClick={overdueInvs.length > 0 ? () => handleKpiClick('overdue', c => flat.some(i => i.clientId === c.id && getDisplayStatus(i) === 'OVERDUE')) : undefined}
            />
            <KpiCard
              label="Invoices Collected Past 30 Days"
              value={collectedPast30Total > 0 ? fmt(collectedPast30Total) : '—'}
              sub={collectedPast30.length > 0 ? `${collectedPast30.length} paid` : ''}
              color={collectedPast30Total > 0 ? 'green' : 'neutral'}
              active={clientFilter === 'collected'}
              onClick={collectedPast30.length > 0 ? () => handleKpiClick('collected', c => flat.some(i => i.clientId === c.id && getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo)) : undefined}
            />
            <KpiCard label="Invoices Collected since start of Year" value={collectedYtdTotal > 0 ? fmt(collectedYtdTotal) : '—'} sub={collectedYtd.length > 0 ? `${collectedYtd.length} paid` : ''} color={collectedYtdTotal > 0 ? 'green' : 'neutral'} />
            <KpiCard label="Clients" value={kpis.activeClients} sub="active" color="neutral" />
          </div>
        )
      })()}

      {/* 3-col strip: Take action | Take notice | Recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: activityOpen ? 'auto 1fr 1fr' : 'auto 1fr', gap: 16, marginBottom: 24, alignItems: 'start' }}>

        {/* Take action — 3 vertical groups side by side */}
        <div style={{ border: '1.5px solid #e0ddd5', borderRadius: 10, padding: '10px 12px', background: '#fafaf8' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 2 }}>Take action</p>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              {
                header: 'New Work',
                items: [
                  { label: 'New client',   onClick: () => setShowNewClientModal(true) },
                  { label: 'New job',      onClick: () => setShowNewJobModal(true) },
                  { label: 'New estimate', onClick: () => setShowNewEstimateModal(true) },
                  { label: 'New quote',    onClick: () => setShowNewQuoteModal(true) },
                ],
              },
              {
                header: 'Billing',
                items: [
                  { label: 'Draft invoice', onClick: () => setShowInvoiceModal(true) },
                  { label: 'Log time',      onClick: () => setShowLogTimeModal(true) },
                ],
              },
              {
                header: 'Expenses',
                items: [
                  { label: 'Add receipt',    onClick: () => router.push('/receipts?upload=1') },
                  { label: 'New work order', onClick: () => setShowNewWorkOrderModal(true) },
                  { label: 'Intake bill',    onClick: () => setShowIntakeBillModal(true) },
                ],
              },
            ].map((group, gi) => (
              <div key={gi} style={{ display: 'flex', gap: 0 }}>
                {gi > 0 && <div style={{ width: 1, background: '#e8e6df', marginRight: 12, alignSelf: 'stretch' }} />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 4px', whiteSpace: 'nowrap' }}>{group.header}</p>
                  {group.items.map(item => (
                    <button
                      key={item.label}
                      onClick={item.onClick}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, whiteSpace: 'nowrap',
                        border: '1.5px solid #e0ddd5', background: 'transparent',
                        padding: '5px 12px', fontSize: 11, fontWeight: 600,
                        color: '#555', cursor: 'pointer',
                      }}
                    >
                      <Plus size={11} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Take notice */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 2 }}>Take notice</p>
          {(notices.length > 0 || pendingSuggestions > 0 || recentPaymentsCount > 0) ? (
            <div style={{ borderRadius: 10, border: '1px solid #e8e6df', background: '#fff', overflow: 'hidden' }}>
              {[
                ...notices.map((n, i) => ({ key: `n${i}`, dot: n.dot, label: n.label, detail: n.detail, onClick: n.onClick })),
                ...(pendingSuggestions > 0 ? [{ key: 'sug', dot: '#3b82f6', label: `${suggestionTxCount} payment match${suggestionTxCount !== 1 ? 'es' : ''} to review`, detail: 'Open the relevant invoice to accept or dismiss', onClick: undefined as (() => void) | undefined }] : []),
                ...(recentPaymentsCount > 0 ? [{ key: 'pay', dot: '#16a34a', label: `${recentPaymentsCount} payment${recentPaymentsCount !== 1 ? 's' : ''} in the last 7 days`, detail: 'Check client cards below', onClick: undefined as (() => void) | undefined }] : []),
              ].map((item, i, arr) => {
                const isActive = (
                  (item.label.startsWith('Invoice — ') && (
                    (item.label.includes('overdue') && clientFilter === 'overdue') ||
                    (item.label.includes('unsent') && clientFilter === 'unsent')
                  )) ||
                  (item.label.startsWith('Quote — ') && (
                    (item.label.includes('awaiting') && clientFilter === 'awaiting-quotes') ||
                    (item.label.includes('not yet invoiced') && clientFilter === 'uninvoiced-quotes')
                  ))
                )
                return (
                  <div
                    key={item.key}
                    onClick={item.onClick}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px', borderBottom: i < arr.length - 1 ? '1px solid #f5f4f0' : 'none', cursor: item.onClick ? 'pointer' : 'default', background: isActive ? '#f8f7fd' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (item.onClick) (e.currentTarget as HTMLDivElement).style.background = isActive ? '#f0eef9' : '#fafaf8' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isActive ? '#f8f7fd' : 'transparent' }}
                  >
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: item.dot, flexShrink: 0 }} />
                    <p style={{ fontSize: 11, fontWeight: 600, margin: 0, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{item.label}</p>
                    <p style={{ fontSize: 10, color: '#aaa', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>{item.detail}</p>
                    {item.onClick && <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>→</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#bbb', paddingLeft: 2, margin: 0 }}>All clear</p>
          )}
        </div>

        {/* Recent activity — dense rows, collapsible */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: 0, paddingLeft: 2 }}>Recent activity</p>
            <button
              onClick={() => setActivityOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: 0, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}
            >
              {activityOpen ? 'hide' : 'show'}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ transform: activityOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          {activityOpen && (() => {
            const activity = deriveRecentActivity(clients, flat)
            if (activity.length === 0) return <p style={{ fontSize: 11, color: '#bbb', paddingLeft: 2, margin: 0 }}>No activity yet</p>
            return (
              <div style={{ borderRadius: 10, border: '1px solid #e8e6df', background: '#fff', overflow: 'hidden' }}>
                {activity.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderBottom: i < activity.length - 1 ? '1px solid #f5f4f0' : 'none' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <p style={{ fontSize: 11, fontWeight: 500, margin: 0, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{item.event}</p>
                      <Link href={`/projects/${item.clientSlug}`} style={{ fontSize: 10, color: '#aaa', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.clientName}</Link>
                      <span style={{ fontSize: 10, color: '#ddd', flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: 10, color: '#bbb', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Client cards */}
      <div ref={cardsRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: 0, paddingLeft: 4 }}>Client accounts</p>
            {clientFilter && (
              <button
                onClick={() => setClientFilter(null)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                  color: clientFilter === 'overdue' ? '#dc2626' : clientFilter === 'collected' ? '#16a34a' : clientFilter === 'unsent' ? '#1d4ed8' : clientFilter === 'awaiting-quotes' ? '#7c3aed' : clientFilter === 'uninvoiced-quotes' ? '#047857' : '#a16207',
                  background: clientFilter === 'overdue' ? '#fef2f2' : clientFilter === 'collected' ? '#f0fdf4' : clientFilter === 'unsent' ? '#eff6ff' : clientFilter === 'awaiting-quotes' ? '#f5f3ff' : clientFilter === 'uninvoiced-quotes' ? '#ecfdf5' : '#fffbeb',
                  border: `1px solid ${clientFilter === 'overdue' ? '#fecaca' : clientFilter === 'collected' ? '#bbf7d0' : clientFilter === 'unsent' ? '#bfdbfe' : clientFilter === 'awaiting-quotes' ? '#ddd6fe' : clientFilter === 'uninvoiced-quotes' ? '#a7f3d0' : '#fde68a'}`,
                  borderRadius: 99, padding: '2px 8px', cursor: 'pointer' }}
              >
                {clientFilter === 'overdue' ? 'Invoices Overdue' : clientFilter === 'collected' ? 'Invoices Collected' : clientFilter === 'unsent' ? 'Unsent drafts' : clientFilter === 'awaiting-quotes' ? 'Quotes awaiting acceptance' : clientFilter === 'uninvoiced-quotes' ? 'Quotes not yet invoiced' : 'Invoices Outstanding'} ✕
              </button>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#bbb', pointerEvents: 'none' }}>
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Search clients, invoices, quotes, jobs…"
              style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 8, border: '1px solid #e8e6df', background: '#fafaf8', fontSize: 12, outline: 'none', width: 240, color: '#1a1a1a' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {clients.filter(client => {
            // KPI / notice filter
            if (clientFilter === 'outstanding') {
              if (client.outstanding <= 0) return false
            }
            if (clientFilter === 'overdue') {
              const clientFlat = flat.filter(i => i.clientId === client.id)
              if (!clientFlat.some(i => getDisplayStatus(i) === 'OVERDUE')) return false
            }
            if (clientFilter === 'unsent') {
              const clientFlat = flat.filter(i => i.clientId === client.id)
              if (!clientFlat.some(i => i.status === 'DRAFT')) return false
            }
            if (clientFilter === 'collected') {
              const clientFlat = flat.filter(i => i.clientId === client.id)
              if (!clientFlat.some(i => getDisplayStatus(i) === 'PAID')) return false
            }
            if (clientFilter === 'awaiting-quotes') {
              if (client.sentQuotes.length === 0) return false
            }
            if (clientFilter === 'uninvoiced-quotes') {
              if (!client.acceptedQuotes.some(q => !q.hasInvoice)) return false
            }
            // Omni search
            if (!clientSearch.trim()) return true
            const q = clientSearch.toLowerCase()
            const nameMatch = client.name.toLowerCase().includes(q) || (client.company ?? '').toLowerCase().includes(q) || (client.contactName ?? '').toLowerCase().includes(q)
            const invoiceMatch = client.invoices.some(i => i.invoiceNumber.toLowerCase().includes(q) || (i.jobName ?? '').toLowerCase().includes(q))
            const quoteMatch = client.acceptedQuotes.some(q2 => q2.title.toLowerCase().includes(q) || q2.quoteNumber.toLowerCase().includes(q))
              || client.sentQuotes.some(q2 => q2.title.toLowerCase().includes(q) || q2.quoteNumber.toLowerCase().includes(q))
            return nameMatch || invoiceMatch || quoteMatch
          }).map(client => {
            const isExpanded = expandedClient === client.id || !!clientFilter
            const clientInvoices = flat.filter(i => i.clientId === client.id)
            const openInvs = clientInvoices.filter(i => { const s = getDisplayStatus(i); return s !== 'PAID' && s !== 'VOID' })
            const hasOverdue = clientInvoices.some(i => getDisplayStatus(i) === 'OVERDUE')

            return (
              <div
                key={client.id}
                style={{ borderRadius: 14, border: `1px solid ${isExpanded ? '#c7c4e8' : '#e8e6df'}`, background: '#fff', overflow: 'hidden', transition: 'border-color 0.15s' }}
              >
                {/* Card header — always visible */}
                {(() => {
                  const clientOverdueTotal = clientInvoices.filter(i => getDisplayStatus(i) === 'OVERDUE').reduce((s, i) => s + (i.total - i.paid), 0)
                  const now = new Date()
                  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
                  const startOfYear = new Date(now.getFullYear(), 0, 1)
                  const clientCollectedPast30 = clientInvoices.filter(i => getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo).reduce((s, i) => s + i.paid, 0)
                  const clientCollectedYtd = clientInvoices.filter(i => getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= startOfYear).reduce((s, i) => s + i.paid, 0)
                  return (
                    <div
                      onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                      style={{ display: 'grid', gridTemplateColumns: clientFilter ? '1fr auto' : '1fr auto auto auto auto auto auto', alignItems: 'center', gap: 16, padding: '8px 14px', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = '#fafaf8' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      {/* Identity */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f0eef9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#534AB7', flexShrink: 0 }}>
                          {client.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.name}</p>
                          {client.company && <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{client.company}</p>}
                        </div>
                      </div>

                      {!clientFilter && <>
                        {/* Quotes accepted */}
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Quotes accepted</p>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: client.acceptedQuotes.length > 0 ? '#534AB7' : '#aaa' }}>
                            {client.acceptedQuotes.length || '—'}
                          </p>
                        </div>

                        {/* Outstanding */}
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Outstanding</p>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: client.outstanding > 0 ? '#a16207' : '#aaa' }}>
                            {client.outstanding > 0 ? fmt(client.outstanding, client.currency) : '—'}
                          </p>
                        </div>

                        {/* Overdue */}
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Overdue</p>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: clientOverdueTotal > 0 ? '#dc2626' : '#aaa' }}>
                            {clientOverdueTotal > 0 ? fmt(clientOverdueTotal, client.currency) : '—'}
                          </p>
                        </div>

                        {/* Collected past 30 days */}
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Collected Past 30 Days</p>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: clientCollectedPast30 > 0 ? '#15803d' : '#aaa' }}>
                            {clientCollectedPast30 > 0 ? fmt(clientCollectedPast30, client.currency) : '—'}
                          </p>
                        </div>

                        {/* Collected YTD */}
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Collected since Jan 1</p>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: clientCollectedYtd > 0 ? '#15803d' : '#aaa' }}>
                            {clientCollectedYtd > 0 ? fmt(clientCollectedYtd, client.currency) : '—'}
                          </p>
                        </div>
                      </>}

                      {/* Chevron */}
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#bbb', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )
                })()}

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f0eeeb', background: '#fafaf8', padding: '16px 18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: clientFilter ? '1fr' : '1fr 260px', gap: 20 }}>

                      {/* Left: invoices + quotes */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                        {/* Invoices */}
                        {(() => {
                          const visibleInvoices = clientFilter === 'overdue'
                            ? clientInvoices.filter(i => getDisplayStatus(i) === 'OVERDUE')
                            : clientFilter === 'unsent'
                            ? clientInvoices.filter(i => i.status === 'DRAFT')
                            : clientFilter === 'outstanding'
                            ? clientInvoices.filter(i => { const s = getDisplayStatus(i); return s === 'SENT' || s === 'PARTIAL' || s === 'OVERDUE' })
                            : clientFilter === 'collected'
                            ? clientInvoices.filter(i => getDisplayStatus(i) === 'PAID')
                            : clientInvoices
                          return visibleInvoices.length > 0 ? (
                          <div>
                            {!clientFilter && <p style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Invoices</p>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {visibleInvoices.map(inv => {
                                const ds = getDisplayStatus(inv)
                                const balance = inv.total - inv.paid
                                const days = daysUntil(inv.dueDate)
                                return (
                                  <div
                                    key={inv.id}
                                    onClick={() => router.push(`/projects/${inv.clientSlug}/invoices/${inv.id}`)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid #e8e6df', cursor: 'pointer', transition: 'border-color 0.15s' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#c7c4e8'}
                                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e6df'}
                                  >
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280', letterSpacing: 0.4, flexShrink: 0, textTransform: 'uppercase' }}>Invoice</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#534AB7', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{inv.invoiceNumber}</span>
                                    {inv.jobName && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', flexShrink: 0, whiteSpace: 'nowrap' }}>{inv.jobName}</span>}
                                    <div style={{ flex: 1 }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#1a1a1a' }}>{fmt(inv.total, inv.currency)}</span>
                                    {balance > 0 && ds !== 'PAID' && ds !== 'VOID' && (
                                      <span style={{ fontSize: 11, color: '#888', fontVariantNumeric: 'tabular-nums' }}>({fmt(balance, inv.currency)} due)</span>
                                    )}
                                    <StatusBadge status={ds} />
                                    {ds === 'OVERDUE' && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 700 }}>{daysAgo(inv.dueDate)}d</span>}
                                    {ds === 'SENT' && days >= 0 && days <= 7 && <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>due in {days}d</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          ) : null
                        })()}

                        {/* Sent quotes (awaiting acceptance) */}
                        {(() => {
                          if (clientFilter && clientFilter !== 'awaiting-quotes') return null
                          const visibleSentQuotes = clientFilter === 'awaiting-quotes' ? client.sentQuotes : []
                          return visibleSentQuotes.length > 0 ? (
                            <div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {visibleSentQuotes.map(q => (
                                  <Link
                                    key={q.id}
                                    href={`/projects/${client.slug}/quotes/${q.id}`}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid #e8e6df', textDecoration: 'none', transition: 'border-color 0.15s' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = '#c7c4e8'}
                                    onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = '#e8e6df'}
                                  >
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eeedfe', color: '#534AB7', letterSpacing: 0.4, flexShrink: 0, textTransform: 'uppercase' }}>Quote</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#534AB7', flexShrink: 0 }}>{q.quoteNumber}</span>
                                    {q.jobName && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', flexShrink: 0, whiteSpace: 'nowrap' }}>{q.jobName}</span>}
                                    <span style={{ fontSize: 12, color: '#555', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{q.title}</span>
                                    {q.totalQuoted != null && (
                                      <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#1a1a1a', flexShrink: 0 }}>{fmt(q.totalQuoted, q.currency)}</span>
                                    )}
                                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#dbeafe', color: '#1e40af', flexShrink: 0 }}>Sent</span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ) : null
                        })()}

                        {/* Accepted quotes */}
                        {(() => {
                          if (clientFilter && clientFilter !== 'uninvoiced-quotes' && clientFilter !== 'awaiting-quotes') return null
                          const visibleAcceptedQuotes = clientFilter === 'uninvoiced-quotes'
                            ? client.acceptedQuotes.filter(q => !q.hasInvoice)
                            : clientFilter ? []
                            : client.acceptedQuotes
                          return visibleAcceptedQuotes.length > 0 ? (
                          <div>
                            {!clientFilter && <p style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Accepted quotes</p>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {visibleAcceptedQuotes.map(q => (
                                <Link
                                  key={q.id}
                                  href={`/projects/${client.slug}/quotes/${q.id}`}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid #e8e6df', textDecoration: 'none', transition: 'border-color 0.15s' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = '#c7c4e8'}
                                  onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = '#e8e6df'}
                                >
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eeedfe', color: '#534AB7', letterSpacing: 0.4, flexShrink: 0, textTransform: 'uppercase' }}>Quote</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#534AB7', flexShrink: 0 }}>{q.quoteNumber}</span>
                                  {q.jobName && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', flexShrink: 0, whiteSpace: 'nowrap' }}>{q.jobName}</span>}
                                  <span style={{ fontSize: 12, color: '#555', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{q.title}</span>
                                  {q.totalQuoted != null && (
                                    <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#1a1a1a', flexShrink: 0 }}>{fmt(q.totalQuoted, q.currency)}</span>
                                  )}
                                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#eeedfe', color: '#534AB7', flexShrink: 0 }}>Accepted</span>
                                </Link>
                              ))}
                            </div>
                          </div>
                          ) : null
                        })()}

                        {clientInvoices.length === 0 && client.acceptedQuotes.length === 0 && !clientFilter && (
                          <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>No invoices or quotes yet</p>
                        )}

                      </div>

                      {/* Right: quick actions — hidden when a KPI/notice filter is active */}
                      {!clientFilter && (
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Quick actions</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {[
                              { label: 'Draft invoice', action: () => { setPreselectedClientId(client.id); setShowInvoiceModal(true) } },
                              { label: 'New estimate', action: () => router.push(`/projects/${client.slug}/estimates/new`) },
                              { label: 'New quote', action: () => router.push(`/projects/${client.slug}/quotes/new`) },
                              { label: 'Log time', action: () => { setPreselectedClientId(client.id); setShowLogTimeModal(true) } },
                              { label: 'Add receipt', action: () => router.push(`/receipts?upload=1&workspaceId=${client.id}`) },
                              { label: 'View project →', action: () => router.push(`/projects/${client.slug}`) },
                            ].map(item => (
                              <button
                                key={item.label}
                                onClick={e => { e.stopPropagation(); item.action() }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, border: '1px solid #e8e6df', background: '#fff', fontSize: 12, fontWeight: 500, color: '#555', cursor: 'pointer', transition: 'all 0.15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#534AB7'; (e.currentTarget as HTMLButtonElement).style.color = '#534AB7' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e8e6df'; (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>


      {/* Studio invoice creation modal */}
      {showInvoiceModal && (
        <StudioInvoiceModal
          clients={clients}
          paymentMethods={paymentMethods}
          invoiceDefaults={invoiceDefaults}
          hasTransactions={hasTransactions}
          initialClientId={preselectedClientId ?? undefined}
          onClose={() => { setShowInvoiceModal(false); setPreselectedClientId(null) }}
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
          initialClientId={preselectedClientId ?? undefined}
          onClose={() => { setShowLogTimeModal(false); setPreselectedClientId(null) }}
        />
      )}
      {showNewWorkOrderModal && (
        <NewWorkOrderModal
          defaultType="CLIENT"
          onClose={() => setShowNewWorkOrderModal(false)}
        />
      )}
      {showIntakeBillModal && (
        <IntakeBillModal
          onClose={() => setShowIntakeBillModal(false)}
        />
      )}
      {markSentTarget && (
        <MarkSentModal
          item={markSentTarget}
          onDone={() => {
            setPendingMarkSent(prev => prev.filter(i => i.invoiceId !== markSentTarget.invoiceId))
            setMarkSentTarget(null)
            router.refresh()
          }}
        />
      )}
      {markSentQuoteTarget && (
        <MarkSentQuoteModal
          item={markSentQuoteTarget}
          onDone={() => {
            setPendingMarkSentQuote(prev => prev.filter(i => i.quoteId !== markSentQuoteTarget.quoteId))
            setMarkSentQuoteTarget(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

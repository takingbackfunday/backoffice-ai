'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DraftInvoicePickerModal } from '@/components/studio/draft-invoice-picker-modal'
import { NewClientModal, NewJobModal, NewEstimateModal, NewQuoteModal, LogTimeModal } from '@/components/studio/studio-action-modals'
import { MarkSentModal } from '@/components/studio/mark-sent-modal'
import { NewWorkOrderModal } from '@/components/work-orders/new-work-order-modal'
import { IntakeBillModal } from '@/components/work-orders/intake-bill-modal'
import { ActionBanner } from '@/components/ui/action-banner'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'
import { StudioTopSection } from '@/components/studio/studio-top-section'
import { ClientCardsSection } from '@/components/studio/client-cards-section'
import { fmt, getDisplayStatus, clientMatchesFilter } from '@/components/studio/studio-shared'
import type {
  Kpis, Client, FlatQuote, ClientDetail, FlatInvoice, ClientFilter,
  PendingMarkSentItem, PendingMarkSentQuoteItem,
} from '@/components/studio/studio-shared'

interface Props {
  clients: Client[]
  flatInvoices: FlatInvoice[]
  flatQuotes: FlatQuote[]
  kpis: Kpis
  pendingSuggestions?: number
  recentPaymentsCount?: number
  isOnboarding?: boolean
  hasOverheadWorkspace?: boolean
}

export function StudioClient({ clients, flatInvoices, flatQuotes, kpis: initialKpis, pendingSuggestions = 0, recentPaymentsCount = 0, isOnboarding = false, hasOverheadWorkspace = true }: Props) {
  const router = useRouter()
  const [kpis] = useState(initialKpis)
  const [expandedClient, setExpandedClient] = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [clientFilter, setClientFilter] = useState<ClientFilter>(null)
  const [creatingOverhead, setCreatingOverhead] = useState(false)
  const cardsRef = useRef<HTMLDivElement>(null)
  const [showInvoicePicker, setShowInvoicePicker] = useState(false)
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
  // Lazy-loaded card details
  const [cardDetails, setCardDetails] = useState<Record<string, ClientDetail>>({})
  const [cardLoading, setCardLoading] = useState<Record<string, boolean>>({})

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

  // Use flatInvoices prop directly instead of deriving from clients
  const flat: FlatInvoice[] = flatInvoices

  // Fetch card detail on expand
  const fetchCardDetail = useCallback(async (clientProfileId: string) => {
    if (cardDetails[clientProfileId] || cardLoading[clientProfileId]) return
    setCardLoading(prev => ({ ...prev, [clientProfileId]: true }))
    try {
      const res = await fetch(`/api/studio/clients/${clientProfileId}`)
      const json = await res.json()
      if (json.data) {
        setCardDetails(prev => ({ ...prev, [clientProfileId]: json.data }))
      }
    } catch {
      // silently fail — card shows empty state
    } finally {
      setCardLoading(prev => ({ ...prev, [clientProfileId]: false }))
    }
  }, [cardDetails, cardLoading])

  // Fetch card details for all clients matched by an active notice/KPI filter
  useEffect(() => {
    if (!clientFilter) return
    for (const c of clients) {
      if (c.clientProfileId && clientMatchesFilter(c, clientFilter, flat, flatQuotes)) {
        fetchCardDetail(c.clientProfileId)
      }
    }
  }, [clientFilter, clients, flat, flatQuotes, fetchCardDetail])

  const notices = useMemo(() => {
    const items: { dot: string; label: string; detail: string; onClick: () => void }[] = []

    // Invoice: overdue
    const overdue = flat.filter(i => getDisplayStatus(i) === 'OVERDUE')
    if (overdue.length > 0) items.push({
      dot: '#ef4444',
      label: `Invoice — ${overdue.length} overdue`,
      detail: `${fmt(overdue.reduce((s, i) => s + (i.total - i.paid), 0))} uncollected`,
      onClick: () => {
        const next: ClientFilter = clientFilter === 'overdue' ? null : 'overdue'
        setClientFilter(next)
        if (next) {
          const first = clients.find(c => clientMatchesFilter(c, 'overdue', flat, flatQuotes))
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
        const next: ClientFilter = clientFilter === 'unsent' ? null : 'unsent'
        setClientFilter(next)
        if (next) {
          const first = clients.find(c => clientMatchesFilter(c, 'unsent', flat, flatQuotes))
          if (first) setExpandedClient(first.id)
        } else setExpandedClient(null)
        setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    // Quote: awaiting client acceptance (sent, no response)
    const awaitingAcceptance = flatQuotes.filter(q => q.status === 'SENT')
    if (awaitingAcceptance.length > 0) items.push({
      dot: '#a78bfa',
      label: `Quote — ${awaitingAcceptance.length} awaiting acceptance`,
      detail: awaitingAcceptance.length === 1
        ? `${awaitingAcceptance[0].quoteNumber} sent to ${awaitingAcceptance[0].clientName}`
        : `Across ${new Set(awaitingAcceptance.map(q => q.clientSlug)).size} client${new Set(awaitingAcceptance.map(q => q.clientSlug)).size !== 1 ? 's' : ''}`,
      onClick: () => {
        const next: ClientFilter = clientFilter === 'awaiting-quotes' ? null : 'awaiting-quotes'
        setClientFilter(next)
        if (next) {
          const first = clients.find(c => clientMatchesFilter(c, 'awaiting-quotes', flat, flatQuotes))
          if (first) setExpandedClient(first.id)
        } else setExpandedClient(null)
        setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    // Quote: accepted but not yet invoiced
    const uninvoiced = flatQuotes.filter(q => q.status === 'ACCEPTED' && !q.hasInvoice)
    if (uninvoiced.length > 0) items.push({
      dot: '#10b981',
      label: `Quote — ${uninvoiced.length} accepted, not yet invoiced`,
      detail: uninvoiced.length === 1
        ? `${uninvoiced[0].quoteNumber} for ${uninvoiced[0].clientName}`
        : `${fmt(uninvoiced.reduce((s, q) => s + (q.totalQuoted ?? 0), 0))} ready to bill`,
      onClick: () => {
        const next: ClientFilter = clientFilter === 'uninvoiced-quotes' ? null : 'uninvoiced-quotes'
        setClientFilter(next)
        if (next) {
          const first = clients.find(c => clientMatchesFilter(c, 'uninvoiced-quotes', flat, flatQuotes))
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

    if (pendingMarkSentQuote.length > 0) {
      const uniqueClients = new Set(pendingMarkSentQuote.map(item => item.projectId))
      items.push({
        dot: '#a78bfa',
        label: `Quote — ${pendingMarkSentQuote.length} downloaded but not marked sent`,
        detail: pendingMarkSentQuote.length === 1
          ? `${pendingMarkSentQuote[0].quoteNumber}`
          : `Across ${uniqueClients.size} client${uniqueClients.size !== 1 ? 's' : ''}`,
        onClick: () => {
          const next: ClientFilter = clientFilter === 'downloaded-quotes' ? null : 'downloaded-quotes'
          setClientFilter(next)
          if (next) {
            const first = clients.find(c => clientMatchesFilter(c, 'downloaded-quotes', flat, flatQuotes, pendingMarkSentQuote))
            if (first) setExpandedClient(first.id)
          } else setExpandedClient(null)
          setTimeout(() => cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
        },
      })
    }

    return items
  }, [flat, clients, clientFilter, router, pendingMarkSent, pendingMarkSentQuote, flatQuotes])

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

      <StudioTopSection
        kpis={kpis}
        flat={flat}
        flatQuotes={flatQuotes}
        clients={clients}
        clientFilter={clientFilter}
        setClientFilter={setClientFilter}
        setExpandedClient={setExpandedClient}
        cardsRef={cardsRef}
        notices={notices}
        pendingSuggestions={pendingSuggestions}
        suggestionTxCount={suggestionTxCount}
        recentPaymentsCount={recentPaymentsCount}
        activityOpen={activityOpen}
        setActivityOpen={setActivityOpen}
        actions={{
          onNewClient: () => setShowNewClientModal(true),
          onNewJob: () => setShowNewJobModal(true),
          onNewEstimate: () => setShowNewEstimateModal(true),
          onNewQuote: () => setShowNewQuoteModal(true),
          onDraftInvoice: () => setShowInvoicePicker(true),
          onLogTime: () => setShowLogTimeModal(true),
          onAddReceipt: () => router.push('/receipts?upload=1'),
          onNewWorkOrder: () => setShowNewWorkOrderModal(true),
          onIntakeBill: () => setShowIntakeBillModal(true),
        }}
      />

      {/* Client cards */}
      <ClientCardsSection
        clients={clients}
        flat={flat}
        flatQuotes={flatQuotes}
        clientFilter={clientFilter}
        setClientFilter={setClientFilter}
        clientSearch={clientSearch}
        setClientSearch={setClientSearch}
        expandedClient={expandedClient}
        setExpandedClient={setExpandedClient}
        fetchCardDetail={fetchCardDetail}
        cardDetails={cardDetails}
        cardLoading={cardLoading}
        cardsRef={cardsRef}
        pendingMarkSentQuote={pendingMarkSentQuote}
        onNavigate={path => router.push(path)}
        onDraftInvoice={clientId => { const c = clients.find(x => x.id === clientId); if (c) router.push(`/projects/${c.slug}/invoices/new`) }}
        onLogTime={clientId => { setPreselectedClientId(clientId); setShowLogTimeModal(true) }}
      />


      {showInvoicePicker && (
        <DraftInvoicePickerModal clients={clients} onClose={() => setShowInvoicePicker(false)} />
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
    </div>
  )
}

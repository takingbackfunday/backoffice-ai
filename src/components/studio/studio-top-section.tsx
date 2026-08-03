import { Plus } from 'lucide-react'
import Link from 'next/link'
import { KpiCard } from '@/components/studio/studio-badges'
import { fmt, getDisplayStatus, deriveRecentActivity, clientMatchesFilter } from '@/components/studio/studio-shared'
import type { Kpis, Client, FlatInvoice, FlatQuote, ClientFilter } from '@/components/studio/studio-shared'

interface Notice {
  dot: string
  label: string
  detail: string
  onClick?: () => void
}

interface TakeActions {
  onNewClient: () => void
  onNewJob: () => void
  onNewEstimate: () => void
  onNewQuote: () => void
  onDraftInvoice: () => void
  onLogTime: () => void
  onAddReceipt: () => void
  onNewWorkOrder: () => void
  onIntakeBill: () => void
}

interface Props {
  kpis: Kpis
  flat: FlatInvoice[]
  flatQuotes: FlatQuote[]
  clients: Client[]
  clientFilter: ClientFilter
  setClientFilter: (f: ClientFilter) => void
  setExpandedClient: (id: string | null) => void
  cardsRef: React.RefObject<HTMLDivElement | null>
  notices: Notice[]
  pendingSuggestions: number
  suggestionTxCount: number
  recentPaymentsCount: number
  activityOpen: boolean
  setActivityOpen: (fn: (o: boolean) => boolean) => void
  actions: TakeActions
}

export function StudioTopSection({
  kpis, flat, flatQuotes, clients, clientFilter, setClientFilter, setExpandedClient,
  cardsRef, notices, pendingSuggestions, suggestionTxCount, recentPaymentsCount,
  activityOpen, setActivityOpen, actions,
}: Props) {
  return (
    <>
      {/* Unified KPI + pipeline row */}
      {(() => {
        const acceptedQuotesTotal = flatQuotes.filter(q => q.status === 'ACCEPTED').reduce((s, q) => s + (q.totalQuoted ?? 0), 0)
        const acceptedQuotesCount = flatQuotes.filter(q => q.status === 'ACCEPTED').length
        const outstandingInvs = flat.filter(i => { const s = getDisplayStatus(i); return s === 'SENT' || s === 'PARTIAL' })
        const overdueInvs = flat.filter(i => getDisplayStatus(i) === 'OVERDUE')
        const now = new Date()
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
        const collectedPast30 = flat.filter(i => getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo)
        const collectedPast30Total = collectedPast30.reduce((s, i) => s + i.paid, 0)
        const collectedYtd = flat.filter(i => {
          const s = getDisplayStatus(i)
          return s === 'PAID' && new Date(i.issueDate) >= new Date(now.getFullYear(), 0, 1)
        })
        const collectedYtdTotal = collectedYtd.reduce((s, i) => s + i.paid, 0)

        function handleKpiClick(filter: 'outstanding' | 'overdue' | 'collected') {
          const next = clientFilter === filter ? null : filter
          setClientFilter(next)
          if (next) {
            const first = clients.find(c => clientMatchesFilter(c, filter, flat, flatQuotes))
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
              value={kpis.totalOutstanding > 0 ? fmt(kpis.totalOutstanding) : '—'}
              sub={outstandingInvs.length > 0 ? `${outstandingInvs.length} invoice${outstandingInvs.length !== 1 ? 's' : ''}` : ''}
              color={kpis.totalOutstanding > 0 ? 'amber' : 'neutral'}
              active={clientFilter === 'outstanding'}
              onClick={kpis.totalOutstanding > 0 ? () => handleKpiClick('outstanding') : undefined}
            />
            <KpiCard
              label="Invoices Overdue"
              value={kpis.overdueCount > 0 ? fmt(overdueInvs.reduce((s, i) => s + (i.total - i.paid), 0)) : '—'}
              sub={overdueInvs.length > 0 ? `${overdueInvs.length} invoice${overdueInvs.length !== 1 ? 's' : ''}` : ''}
              color={kpis.overdueCount > 0 ? 'red' : 'neutral'}
              active={clientFilter === 'overdue'}
              onClick={kpis.overdueCount > 0 ? () => handleKpiClick('overdue') : undefined}
            />
            <KpiCard
              label="Invoices Collected Past 30 Days"
              value={collectedPast30Total > 0 ? fmt(collectedPast30Total) : '—'}
              sub={collectedPast30.length > 0 ? `${collectedPast30.length} paid` : ''}
              color={collectedPast30Total > 0 ? 'green' : 'neutral'}
              active={clientFilter === 'collected'}
              onClick={collectedPast30.length > 0 ? () => handleKpiClick('collected') : undefined}
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
                  { label: 'New client',   onClick: actions.onNewClient },
                  { label: 'New job',      onClick: actions.onNewJob },
                  { label: 'New estimate', onClick: actions.onNewEstimate },
                  { label: 'New quote',    onClick: actions.onNewQuote },
                ],
              },
              {
                header: 'Billing',
                items: [
                  { label: 'Draft invoice', onClick: actions.onDraftInvoice },
                  { label: 'Log time',      onClick: actions.onLogTime },
                ],
              },
              {
                header: 'Expenses',
                items: [
                  { label: 'Add receipt',    onClick: actions.onAddReceipt },
                  { label: 'New work order', onClick: actions.onNewWorkOrder },
                  { label: 'Intake bill',    onClick: actions.onIntakeBill },
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
    </>
  )
}

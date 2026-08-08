import Link from 'next/link'
import { StatusBadge } from '@/components/studio/studio-badges'
import { fmt, getDisplayStatus, daysUntil, daysAgo } from '@/components/studio/studio-shared'
import type { Client, ClientDetail, FlatInvoice, ClientFilter } from '@/components/studio/studio-shared'

const HIGHLIGHT: Record<string, { border: string; bg: string }> = {
  overdue: { border: '#ef4444', bg: '#fef2f2' },
  unsent: { border: '#3b82f6', bg: '#eff6ff' },
  outstanding: { border: '#a16207', bg: '#fffbeb' },
  collected: { border: '#16a34a', bg: '#f0fdf4' },
  'awaiting-quotes': { border: '#a78bfa', bg: '#f5f3ff' },
  'uninvoiced-quotes': { border: '#10b981', bg: '#ecfdf5' },
  'downloaded-quotes': { border: '#6366f1', bg: '#eef2ff' },
}

function highlightConfig(filter: ClientFilter): { border: string; bg: string } | null {
  return filter ? HIGHLIGHT[filter] ?? null : null
}

interface Props {
  client: Client
  isExpanded: boolean
  clientFilter: ClientFilter
  clientInvoices: FlatInvoice[]
  detail: ClientDetail | undefined
  loading: boolean
  onExpand: () => void
  onNavigate: (path: string) => void
  onDraftInvoice: () => void
  onLogTime: () => void
}

export function ClientCard({
  client, isExpanded, clientFilter, clientInvoices, detail, loading,
  onExpand, onNavigate, onDraftInvoice, onLogTime,
}: Props) {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  return (
    <div
      style={{ borderRadius: 14, border: `1px solid ${isExpanded ? '#c7c4e8' : '#e8e6df'}`, background: '#fff', overflow: 'hidden', transition: 'border-color 0.15s' }}
    >
      {/* Card header — always visible */}
      {(() => {
        const clientOverdueTotal = clientInvoices.filter(i => getDisplayStatus(i) === 'OVERDUE').reduce((s, i) => s + (i.total - i.paid), 0)
        const clientOutstandingTotal = clientInvoices.filter(i => { const s = getDisplayStatus(i); return s === 'SENT' || s === 'PARTIAL' }).reduce((s, i) => s + (i.total - i.paid), 0)
        const startOfYear = new Date(now.getFullYear(), 0, 1)
        const clientCollectedPast30 = clientInvoices.filter(i => getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo).reduce((s, i) => s + i.paid, 0)
        const clientCollectedYtd = clientInvoices.filter(i => getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= startOfYear).reduce((s, i) => s + i.paid, 0)

        return (
          <div
            onClick={onExpand}
            style={{ display: 'grid', gridTemplateColumns: clientFilter ? '1fr auto' : '1fr auto auto auto auto auto auto', alignItems: 'center', gap: 12, padding: '4px 14px', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => {
                if (!isExpanded) {
                  (e.currentTarget as HTMLDivElement).style.background = '#fafaf8'
                  const chevron = (e.currentTarget as HTMLDivElement).querySelector('[data-chevron]') as HTMLElement | null
                  if (chevron) chevron.style.color = '#888'
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                const chevron = (e.currentTarget as HTMLDivElement).querySelector('[data-chevron]') as HTMLElement | null
                if (chevron) chevron.style.color = '#bbb'
              }}
          >
            {/* Identity — click to navigate to client page */}
            <div
              onClick={e => { e.stopPropagation(); onNavigate(`/projects/${client.slug}`) }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.background = '#f5f3ff'
                const ps = (e.currentTarget as HTMLDivElement).querySelectorAll('p')
                ps.forEach(p => p.style.color = '#534AB7')
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                const ps = (e.currentTarget as HTMLDivElement).querySelectorAll('p')
                ps.forEach(p => p.style.color = '')
                ;(e.currentTarget as HTMLDivElement).style.borderRadius = ''
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: 280, cursor: 'pointer', borderRadius: 6, paddingLeft: 4, transition: 'background 0.15s' }}
            >
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#f0eef9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#534AB7', flexShrink: 0, transition: 'background 0.15s' }}>
                {client.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.15s' }}>{client.name}</p>
                {client.company && <p style={{ fontSize: 10, color: '#aaa', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.15s' }}>{client.company}</p>}
              </div>
            </div>

            {!clientFilter && <>
              {/* Quotes accepted */}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: '#aaa', margin: '0 0 0px', whiteSpace: 'nowrap' }}>Quotes accepted</p>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: client.acceptedQuotes.length > 0 ? '#534AB7' : '#aaa' }}>
                  {client.acceptedQuotes.length || '—'}
                </p>
              </div>

              {/* Outstanding */}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: '#aaa', margin: '0 0 0px', whiteSpace: 'nowrap' }}>Outstanding</p>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: clientOutstandingTotal > 0 ? '#a16207' : '#aaa' }}>
                  {clientOutstandingTotal > 0 ? fmt(clientOutstandingTotal, client.currency) : '—'}
                </p>
              </div>

              {/* Overdue */}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: '#aaa', margin: '0 0 0px', whiteSpace: 'nowrap' }}>Overdue</p>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: clientOverdueTotal > 0 ? '#dc2626' : '#aaa' }}>
                  {clientOverdueTotal > 0 ? fmt(clientOverdueTotal, client.currency) : '—'}
                </p>
              </div>

              {/* Collected past 30 days */}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: '#aaa', margin: '0 0 0px', whiteSpace: 'nowrap' }}>Collected Past 30 Days</p>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: clientCollectedPast30 > 0 ? '#15803d' : '#aaa' }}>
                  {clientCollectedPast30 > 0 ? fmt(clientCollectedPast30, client.currency) : '—'}
                </p>
              </div>

              {/* Collected YTD */}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: '#aaa', margin: '0 0 0px', whiteSpace: 'nowrap' }}>Collected since Jan 1</p>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: clientCollectedYtd > 0 ? '#15803d' : '#aaa' }}>
                  {clientCollectedYtd > 0 ? fmt(clientCollectedYtd, client.currency) : '—'}
                </p>
              </div>
            </>}

            {/* Chevron */}
            <svg data-chevron width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#bbb', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s, color 0.15s', flexShrink: 0 }}>
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )
      })()}

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #f0eeeb', background: '#fafaf8', padding: '16px 18px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#888' }}>
              <div style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #ddd', borderTopColor: '#888', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              <span style={{ fontSize: 12 }}>Loading details…</span>
            </div>
          ) : (() => {
            if (!detail) return <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>No details available</p>
            const hl = highlightConfig(clientFilter)
            return (
            <div style={{ display: 'grid', gridTemplateColumns: clientFilter ? '1fr' : '1fr 260px', gap: 20 }}>

            {/* Left: invoices + quotes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Invoices */}
              {(() => {
                const visibleInvoices = clientFilter === 'overdue'
                  ? detail.invoices.filter(i => getDisplayStatus(i) === 'OVERDUE')
                  : clientFilter === 'unsent'
                  ? detail.invoices.filter(i => i.status === 'DRAFT')
                  : clientFilter === 'outstanding'
                  ? detail.invoices.filter(i => { const s = getDisplayStatus(i); return s === 'SENT' || s === 'PARTIAL' })
                  : clientFilter === 'collected'
                  ? detail.invoices.filter(i => getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo)
                  : detail.invoices
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
                          onClick={() => onNavigate(`/projects/${client.slug}/invoices/${inv.id}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: hl?.bg ?? '#fff', border: `1.5px solid ${hl?.border ?? '#e8e6df'}`, cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
                          onMouseEnter={e => { if (!hl) (e.currentTarget as HTMLDivElement).style.borderColor = '#c7c4e8' }}
                          onMouseLeave={e => { if (!hl) (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e6df' }}
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

              {/* Draft quotes (downloaded but not sent) */}
              {(() => {
                if (clientFilter !== 'downloaded-quotes') return null
                const visibleDraftQuotes = detail?.draftQuotes ?? []
                return visibleDraftQuotes.length > 0 ? (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {visibleDraftQuotes.map(q => (
                        <Link
                          key={q.id}
                          href={`/projects/${client.slug}/quotes/${q.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: hl?.bg ?? '#fff', border: `1.5px solid ${hl?.border ?? '#e8e6df'}`, textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s' }}
                          onMouseEnter={e => { if (!hl) (e.currentTarget as HTMLAnchorElement).style.borderColor = '#c7c4e8' }}
                          onMouseLeave={e => { if (!hl) (e.currentTarget as HTMLAnchorElement).style.borderColor = '#e8e6df' }}
                        >
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eeedfe', color: '#534AB7', letterSpacing: 0.4, flexShrink: 0, textTransform: 'uppercase' }}>Quote</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#534AB7', flexShrink: 0 }}>{q.quoteNumber}</span>
                          {q.jobName && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', flexShrink: 0, whiteSpace: 'nowrap' }}>{q.jobName}</span>}
                          <span style={{ fontSize: 12, color: '#555', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{q.title}</span>
                          {q.totalQuoted != null && (
                            <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#1a1a1a', flexShrink: 0 }}>{fmt(q.totalQuoted, q.currency)}</span>
                          )}
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#fef3c7', color: '#92400e', flexShrink: 0 }}>Draft</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>No draft quotes found</p>
                )
              })()}

              {/* Sent quotes (awaiting acceptance) */}
              {(() => {
                if (clientFilter && clientFilter !== 'awaiting-quotes') return null
                const visibleSentQuotes = clientFilter === 'awaiting-quotes' ? detail.sentQuotes : []
                return visibleSentQuotes.length > 0 ? (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {visibleSentQuotes.map(q => (
                        <Link
                          key={q.id}
                          href={`/projects/${client.slug}/quotes/${q.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: hl?.bg ?? '#fff', border: `1.5px solid ${hl?.border ?? '#e8e6df'}`, textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s' }}
                          onMouseEnter={e => { if (!hl) (e.currentTarget as HTMLAnchorElement).style.borderColor = '#c7c4e8' }}
                          onMouseLeave={e => { if (!hl) (e.currentTarget as HTMLAnchorElement).style.borderColor = '#e8e6df' }}
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
                  ? detail.acceptedQuotes.filter(q => !q.hasInvoice)
                  : clientFilter ? []
                  : detail.acceptedQuotes
                return visibleAcceptedQuotes.length > 0 ? (
                <div>
                  {!clientFilter && <p style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Accepted quotes</p>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {visibleAcceptedQuotes.map(q => (
                      <Link
                        key={q.id}
                        href={`/projects/${client.slug}/quotes/${q.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: hl?.bg ?? '#fff', border: `1.5px solid ${hl?.border ?? '#e8e6df'}`, textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s' }}
                        onMouseEnter={e => { if (!hl) (e.currentTarget as HTMLAnchorElement).style.borderColor = '#c7c4e8' }}
                        onMouseLeave={e => { if (!hl) (e.currentTarget as HTMLAnchorElement).style.borderColor = '#e8e6df' }}
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

              {detail.invoices.length === 0 && detail.acceptedQuotes.length === 0 && !clientFilter && (
                <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>No invoices or quotes yet</p>
              )}

            </div>

            {/* Right: quick actions — hidden when a KPI/notice filter is active */}
            {!clientFilter && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Quick actions</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[
                    { label: 'Draft invoice', action: onDraftInvoice },
                    { label: 'New estimate', action: () => onNavigate(`/projects/${client.slug}/estimates/new`) },
                    { label: 'New quote', action: () => onNavigate(`/projects/${client.slug}/quotes/new`) },
                    { label: 'Log time', action: onLogTime },
                    { label: 'Add receipt', action: () => onNavigate(`/receipts?upload=1&workspaceId=${client.id}`) },
                    { label: 'View project →', action: () => onNavigate(`/projects/${client.slug}`) },
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
            )
          })()}
        </div>
      )}
    </div>
  )
}

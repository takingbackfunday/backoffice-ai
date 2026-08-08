import { ClientCard } from '@/components/studio/client-card'
import { clientMatchesFilter } from '@/components/studio/studio-shared'
import type { Client, ClientDetail, FlatInvoice, FlatQuote, ClientFilter, PendingMarkSentQuoteItem } from '@/components/studio/studio-shared'

interface Props {
  clients: Client[]
  flat: FlatInvoice[]
  flatQuotes: FlatQuote[]
  clientFilter: ClientFilter
  setClientFilter: (f: ClientFilter) => void
  clientSearch: string
  setClientSearch: (s: string) => void
  expandedClient: string | null
  setExpandedClient: (id: string | null) => void
  fetchCardDetail: (clientProfileId: string) => void
  cardDetails: Record<string, ClientDetail>
  cardLoading: Record<string, boolean>
  cardsRef: React.RefObject<HTMLDivElement | null>
  pendingMarkSentQuote: PendingMarkSentQuoteItem[]
  onNavigate: (path: string) => void
  onDraftInvoice: (clientId: string) => void
  onLogTime: (clientId: string) => void
}

export function ClientCardsSection({
  clients, flat, flatQuotes, clientFilter, setClientFilter, clientSearch, setClientSearch,
  expandedClient, setExpandedClient, fetchCardDetail, cardDetails, cardLoading,
  cardsRef, pendingMarkSentQuote, onNavigate, onDraftInvoice, onLogTime,
}: Props) {
  return (
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
          // KPI / notice filter — shared predicate
          if (clientFilter && !clientMatchesFilter(client, clientFilter, flat, flatQuotes, pendingMarkSentQuote)) return false
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

          return (
            <ClientCard
              key={client.id}
              client={client}
              isExpanded={isExpanded}
              clientFilter={clientFilter}
              clientInvoices={clientInvoices}
              detail={cardDetails[client.clientProfileId]}
              loading={!!cardLoading[client.clientProfileId]}
              onExpand={() => {
                if (!isExpanded) {
                  setExpandedClient(client.id)
                  if (client.clientProfileId) fetchCardDetail(client.clientProfileId)
                } else {
                  setExpandedClient(null)
                }
              }}
              onNavigate={onNavigate}
              onDraftInvoice={() => onDraftInvoice(client.id)}
              onLogTime={() => onLogTime(client.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

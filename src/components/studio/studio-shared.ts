/* ------------------------------------------------------------------ */
/*  Shared types + helpers for the Studio client view                   */
/* ------------------------------------------------------------------ */

export interface Kpis {
  activeClients: number
  openInvoices: number
  totalOutstanding: number
  revenueThisMonth: number
  overdueCount: number
}

export interface Invoice {
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

export interface Client {
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

export interface InvoiceDefaults {
  taxEnabled?: boolean
  taxLabel?: string
  taxMode?: 'percent' | 'flat'
  taxRate?: string
  currency?: string
  notes?: string
}

export interface FlatQuote {
  id: string
  quoteNumber: string
  title: string
  totalQuoted: number | null
  currency: string
  status: string
  sentAt: string | null
  hasInvoice: boolean
  jobName: string | null
  clientProfileId: string
  clientName: string
  clientSlug: string
}

export interface ClientDetail {
  invoices: Invoice[]
  acceptedQuotes: { id: string; quoteNumber: string; title: string; totalQuoted: number | null; currency: string; hasInvoice: boolean; jobName: string | null }[]
  sentQuotes: { id: string; quoteNumber: string; title: string; totalQuoted: number | null; currency: string; sentAt: string | null; jobName: string | null }[]
  draftQuotes: { id: string; quoteNumber: string; title: string; totalQuoted: number | null; currency: string; hasInvoice: boolean; jobName: string | null }[]
  jobs: { id: string; name: string }[]
  receiptCount: number
}

export type FlatInvoice = Invoice & { clientId: string; clientProfileId: string; clientName: string; clientSlug: string; clientCompany: string | null }

export type ClientFilter = 'outstanding' | 'overdue' | 'unsent' | 'collected' | 'awaiting-quotes' | 'uninvoiced-quotes' | 'downloaded-quotes' | null

export interface PendingMarkSentItem {
  invoiceId: string
  invoiceNumber: string
  projectId: string
  projectSlug: string
  downloadedAt: number
}

export interface PendingMarkSentQuoteItem {
  quoteId: string
  quoteNumber: string
  projectId: string
  projectSlug: string
  downloadedAt: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

export function clientMatchesFilter(
  client: Pick<Client, 'id' | 'clientProfileId'>,
  filter: Exclude<ClientFilter, null>,
  flat: FlatInvoice[],
  flatQuotes: FlatQuote[],
  pendingMarkSentQuote?: PendingMarkSentQuoteItem[],
): boolean {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  switch (filter) {
    case 'outstanding':
      return flat.some(i => i.clientId === client.id && (getDisplayStatus(i) === 'SENT' || getDisplayStatus(i) === 'PARTIAL'))
    case 'overdue':
      return flat.some(i => i.clientId === client.id && getDisplayStatus(i) === 'OVERDUE')
    case 'unsent':
      return flat.some(i => i.clientId === client.id && i.status === 'DRAFT')
    case 'collected':
      return flat.some(i => i.clientId === client.id && getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo)
    case 'awaiting-quotes':
      return flatQuotes.some(q => q.clientProfileId === client.clientProfileId && q.status === 'SENT')
    case 'uninvoiced-quotes':
      return flatQuotes.some(q => q.clientProfileId === client.clientProfileId && q.status === 'ACCEPTED' && !q.hasInvoice)
    case 'downloaded-quotes':
      return !!pendingMarkSentQuote?.some(item => item.projectId === client.id)
  }
}

export const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

export function getDisplayStatus(inv: Invoice): string {
  if (inv.status === 'SENT' && new Date(inv.dueDate) < new Date()) return 'OVERDUE'
  return inv.status
}

export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export function daysAgo(dateStr: string): number {
  return -daysUntil(dateStr)
}

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:   { bg: '#f3f4f6', text: '#374151' },
  SENT:    { bg: '#dbeafe', text: '#1e40af' },
  PARTIAL: { bg: '#fef3c7', text: '#92400e' },
  PAID:    { bg: '#d1fae5', text: '#065f46' },
  OVERDUE: { bg: '#fee2e2', text: '#991b1b' },
  VOID:    { bg: '#f3f4f6', text: '#9ca3af' },
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Sent', PARTIAL: 'Partial',
  PAID: 'Paid', OVERDUE: 'Overdue', VOID: 'Void',
}

interface ActivityItem {
  time: string
  event: string
  clientName: string
  clientSlug: string
  color: string
}

export function deriveRecentActivity(clients: Client[], flat: (Invoice & { clientId: string; clientName: string; clientSlug: string })[]): ActivityItem[] {
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
  return items.slice(0, 6).map(({ _date: _, ...rest }) => rest)
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

export interface PendingMarkSentQuote {
  quoteId: string
  quoteNumber: string
  projectId: string
  projectSlug: string
  downloadedAt: number
}

const KEY = 'pending-mark-sent-quote'

function readAll(): PendingMarkSentQuote[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeAll(items: PendingMarkSentQuote[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function stashPendingMarkSentQuote(entry: PendingMarkSentQuote): void {
  const items = readAll()
  if (items.some(e => e.quoteId === entry.quoteId)) return
  items.push(entry)
  writeAll(items)
}

export function removePendingMarkSentQuote(quoteId: string): void {
  const items = readAll().filter(e => e.quoteId !== quoteId)
  writeAll(items)
}

export interface PendingMarkSentInvoice {
  invoiceId: string
  invoiceNumber: string
  projectId: string
  projectSlug: string
  downloadedAt: number
}

const INVOICE_KEY = 'pending-mark-sent'

function readAllInvoices(): PendingMarkSentInvoice[] {
  try {
    return JSON.parse(localStorage.getItem(INVOICE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeAllInvoices(items: PendingMarkSentInvoice[]): void {
  try {
    localStorage.setItem(INVOICE_KEY, JSON.stringify(items))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function stashPendingMarkSentInvoice(entry: PendingMarkSentInvoice): void {
  const items = readAllInvoices()
  if (items.some(e => e.invoiceId === entry.invoiceId)) return
  items.push(entry)
  writeAllInvoices(items)
}

export function removePendingMarkSentInvoice(invoiceId: string): void {
  const items = readAllInvoices().filter(e => e.invoiceId !== invoiceId)
  writeAllInvoices(items)
}

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

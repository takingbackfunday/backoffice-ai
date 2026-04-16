'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ReceiptUpload, type ReceiptData } from './receipt-upload'

interface Workspace {
  id: string
  name: string
}

interface Transaction {
  id: string
  date: string
  amount: string
  description: string
  category: string | null
}

interface Receipt {
  id: string
  status: string
  thumbnailUrl: string | null
  ocrMarkdown: string | null
  extractedData: Record<string, unknown> | null
  createdAt: string
  transaction: Transaction | null
  workspace: Workspace | null
  workspaceId: string | null
}

interface ReviewFields {
  vendor: string
  date: string
  total: string
  subtotal: string
  tax: string
  paymentMethod: string
  rawCategory: string
}

interface TxSuggestion {
  id: string
  date: string
  amount: number
  description: string
  accountName: string
  currency: string | null
  score: number
  reasoning: string
}

function toReviewFields(extracted: Record<string, unknown> | null): ReviewFields {
  return {
    vendor: String(extracted?.vendor ?? ''),
    date: String(extracted?.date ?? ''),
    total: extracted?.total != null ? String(extracted.total) : '',
    subtotal: extracted?.subtotal != null ? String(extracted.subtotal) : '',
    tax: extracted?.tax != null ? String(extracted.tax) : '',
    paymentMethod: String(extracted?.paymentMethod ?? ''),
    rawCategory: String(extracted?.rawCategory ?? ''),
  }
}

function statusBadgeClass(status: string) {
  if (status === 'READY') return 'bg-green-100 text-green-700'
  if (status === 'INVOICED') return 'bg-blue-100 text-blue-700'
  if (status === 'FAILED') return 'bg-red-100 text-red-700'
  if (status === 'NEEDS_REVIEW') return 'bg-amber-100 text-amber-700'
  return 'bg-yellow-100 text-yellow-700'
}

function statusLabel(status: string) {
  if (status === 'NEEDS_REVIEW') return 'Review'
  if (status === 'READY') return 'Ready'
  if (status === 'INVOICED') return 'Invoiced'
  return status
}

const inputClass =
  'w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring'

export function ReceiptsPageClient({
  workspaces,
  initialWorkspaceId,
  initialShowUpload,
}: {
  workspaces: Workspace[]
  initialWorkspaceId?: string
  initialShowUpload?: boolean
}) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(initialShowUpload ?? false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewFields, setReviewFields] = useState<ReviewFields | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [workspaceFilter, setWorkspaceFilter] = useState<string | null>(initialWorkspaceId ?? null)
  // Transaction linking state
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<TxSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [txSearch, setTxSearch] = useState('')
  const [txSearchResults, setTxSearchResults] = useState<TxSuggestion[]>([])
  const [txSearching, setTxSearching] = useState(false)
  const [linkingTxId, setLinkingTxId] = useState<string | null>(null)

  const activeWorkspace = workspaceFilter ? workspaces.find(w => w.id === workspaceFilter) : null

  const loadReceipts = useCallback(async () => {
    const url = workspaceFilter
      ? `/api/receipts?workspaceId=${workspaceFilter}`
      : '/api/receipts'
    const res = await fetch(url)
    const json = await res.json()
    if (res.ok) setReceipts(json.data ?? [])
    setLoading(false)
  }, [workspaceFilter])

  useEffect(() => {
    setLoading(true)
    loadReceipts()
  }, [loadReceipts])

  async function handleRetry(id: string) {
    setRetrying(id)
    const res = await fetch(`/api/receipts/${id}/retry`, { method: 'POST' })
    const json = await res.json()
    if (res.ok) {
      setReceipts((prev) => prev.map((r) => (r.id === id ? json.data : r)))
    }
    setRetrying(null)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/receipts/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setReceipts((prev) => prev.filter((r) => r.id !== id))
      if (reviewingId === id) { setReviewingId(null); setReviewFields(null) }
      if (expandedId === id) setExpandedId(null)
      if (linkingId === id) closeLinking()
    }
    setDeleting(null)
  }

  function handleUploadSuccess(receipt: ReceiptData) {
    setReceipts((prev) => [receipt as Receipt, ...prev])
    setShowUpload(false)
  }

  function openReview(receipt: Receipt) {
    setReviewingId(receipt.id)
    setReviewFields(toReviewFields(receipt.extractedData))
    setReviewError(null)
  }

  function closeReview() {
    setReviewingId(null)
    setReviewFields(null)
    setReviewError(null)
  }

  function setReviewField(key: keyof ReviewFields, value: string) {
    setReviewFields((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleConfirm(receiptId: string) {
    if (!reviewFields) return
    setConfirming(true)
    setReviewError(null)
    try {
      const receipt = receipts.find((r) => r.id === receiptId)
      const original = (receipt?.extractedData ?? {}) as Record<string, unknown>
      const updated: Record<string, unknown> = {
        ...original,
        vendor: reviewFields.vendor || null,
        date: reviewFields.date || null,
        total: reviewFields.total !== '' ? parseFloat(reviewFields.total) : null,
        subtotal: reviewFields.subtotal !== '' ? parseFloat(reviewFields.subtotal) : null,
        tax: reviewFields.tax !== '' ? parseFloat(reviewFields.tax) : null,
        paymentMethod: reviewFields.paymentMethod || null,
        rawCategory: reviewFields.rawCategory || null,
      }
      const res = await fetch(`/api/receipts/${receiptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedData: updated, confirmed: true }),
      })
      const json = await res.json()
      if (!res.ok) { setReviewError(json.error ?? 'Failed to confirm receipt'); return }
      setReceipts((prev) => prev.map((r) => (r.id === receiptId ? json.data : r)))
      closeReview()
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setConfirming(false)
    }
  }

  async function handleAssignWorkspace(receiptId: string, workspaceId: string | null) {
    setAssigningId(receiptId)
    const res = await fetch(`/api/receipts/${receiptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
    const json = await res.json()
    if (res.ok) setReceipts((prev) => prev.map((r) => (r.id === receiptId ? json.data : r)))
    setAssigningId(null)
  }

  // ── Transaction linking ────────────────────────────────────────────

  function closeLinking() {
    setLinkingId(null)
    setSuggestions([])
    setTxSearch('')
    setTxSearchResults([])
  }

  async function openLinking(receiptId: string) {
    if (linkingId === receiptId) { closeLinking(); return }
    closeLinking()
    setLinkingId(receiptId)
    setSuggestionsLoading(true)
    try {
      const res = await fetch(`/api/receipts/${receiptId}/suggest-transactions`)
      const json = await res.json()
      if (res.ok) setSuggestions(json.data ?? [])
    } catch { /* non-critical */ }
    setSuggestionsLoading(false)
  }

  async function handleLinkTransaction(receiptId: string, transactionId: string) {
    setLinkingTxId(transactionId)
    const res = await fetch(`/api/receipts/${receiptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    })
    const json = await res.json()
    if (res.ok) {
      setReceipts((prev) => prev.map((r) => (r.id === receiptId ? json.data : r)))
      closeLinking()
    }
    setLinkingTxId(null)
  }

  async function handleUnlinkTransaction(receiptId: string) {
    const res = await fetch(`/api/receipts/${receiptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: null }),
    })
    const json = await res.json()
    if (res.ok) setReceipts((prev) => prev.map((r) => (r.id === receiptId ? json.data : r)))
  }

  async function handleTxSearch(query: string) {
    setTxSearch(query)
    if (query.trim().length < 2) { setTxSearchResults([]); return }
    setTxSearching(true)
    try {
      const res = await fetch(`/api/transactions?search=${encodeURIComponent(query)}&pageSize=5`)
      const json = await res.json()
      if (res.ok) {
        const rows = (json.data ?? []) as Array<{ id: string; date: string; amount: number; description: string; account: { name: string; currency: string | null } }>
        setTxSearchResults(rows.map(r => ({
          id: r.id,
          date: r.date,
          amount: Number(r.amount),
          description: r.description,
          accountName: r.account.name,
          currency: r.account.currency,
          score: 0,
          reasoning: 'manual search',
        })))
      }
    } catch { /* non-critical */ }
    setTxSearching(false)
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading receipts...</div>
  }

  return (
    <div className="p-6 space-y-4">
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Receipt full view"
            className="max-w-full max-h-full object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => setShowUpload((v) => !v)}>
          {showUpload ? 'Cancel' : '+ Upload receipt'}
        </Button>
        {activeWorkspace && (
          <div className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1">
            <span className="text-muted-foreground">Client:</span>
            <span className="font-medium">{activeWorkspace.name}</span>
            <button
              className="ml-1 text-muted-foreground hover:text-foreground leading-none"
              onClick={() => setWorkspaceFilter(null)}
              title="Clear filter"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {showUpload && (
        <div className="border rounded-lg p-4 bg-card">
          <ReceiptUpload onSuccess={handleUploadSuccess} />
        </div>
      )}

      {receipts.length === 0 && !showUpload && (
        <div className="text-sm text-muted-foreground text-center py-12">
          No receipts{activeWorkspace ? ` for ${activeWorkspace.name}` : ''}. Upload your first one above.
        </div>
      )}

      {receipts.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left w-12">Photo</th>
                <th className="px-3 py-2 text-left">Vendor</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Transaction</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => {
                const extracted = receipt.extractedData as {
                  vendor?: string | null
                  currency?: string | null
                  total?: number | null
                  date?: string | null
                  subtotal?: number | null
                  tax?: number | null
                  paymentMethod?: string | null
                  rawCategory?: string | null
                  items?: Array<{ name: string; totalPrice: number | null }>
                } | null
                const isExpanded = expandedId === receipt.id
                const isReviewing = reviewingId === receipt.id
                const isLinking = linkingId === receipt.id

                return (
                  <>
                    <tr
                      key={receipt.id}
                      className={cn(
                        'border-b last:border-0 hover:bg-muted/20 transition-colors',
                        (isExpanded || isReviewing || isLinking) && 'bg-muted/20'
                      )}
                    >
                      {/* Thumbnail */}
                      <td className="px-3 py-2">
                        {receipt.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={receipt.thumbnailUrl}
                            alt="Receipt"
                            className="w-10 h-10 object-cover rounded cursor-zoom-in shrink-0"
                            onClick={() => setLightboxUrl(receipt.thumbnailUrl!)}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                            —
                          </div>
                        )}
                      </td>

                      {/* Vendor */}
                      <td className="px-3 py-2">
                        <span className="font-medium">
                          {extracted?.vendor ? String(extracted.vendor) : (
                            <span className="text-muted-foreground">Unknown vendor</span>
                          )}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {extracted?.date
                          ? String(extracted.date)
                          : new Date(receipt.createdAt).toLocaleDateString()}
                      </td>

                      {/* Total */}
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {extracted?.total != null
                          ? `${extracted.currency ? String(extracted.currency) + ' ' : ''}${String(extracted.total)}`
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2">
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap', statusBadgeClass(receipt.status))}>
                          {statusLabel(receipt.status)}
                        </span>
                      </td>

                      {/* Client */}
                      <td className="px-3 py-2">
                        {receipt.status === 'READY' || receipt.status === 'INVOICED' ? (
                          receipt.workspace ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-xs truncate max-w-[120px]">{receipt.workspace.name}</span>
                              {receipt.status === 'READY' && (
                                <button
                                  className="text-xs text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                                  disabled={assigningId === receipt.id}
                                  onClick={() => handleAssignWorkspace(receipt.id, null)}
                                  title="Unassign client"
                                >✕</button>
                              )}
                            </div>
                          ) : workspaces.length > 0 ? (
                            <select
                              className="text-xs border border-border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-w-[120px]"
                              defaultValue=""
                              disabled={assigningId === receipt.id}
                              onChange={(e) => { if (e.target.value) handleAssignWorkspace(receipt.id, e.target.value) }}
                            >
                              <option value="" disabled>Assign…</option>
                              {workspaces.map((ws) => (
                                <option key={ws.id} value={ws.id}>{ws.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Transaction */}
                      <td className="px-3 py-2 text-xs">
                        {receipt.transaction ? (
                          <div className="flex items-center gap-1 max-w-[160px]">
                            <span className="truncate text-muted-foreground" title={receipt.transaction.description}>
                              {receipt.transaction.description}
                            </span>
                            <button
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                              title="Unlink transaction"
                              onClick={() => handleUnlinkTransaction(receipt.id)}
                            >✕</button>
                          </div>
                        ) : receipt.status !== 'FAILED' ? (
                          <button
                            className={cn(
                              'text-xs underline whitespace-nowrap',
                              isLinking ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                            onClick={() => openLinking(receipt.id)}
                          >
                            {isLinking ? 'Cancel' : 'Link transaction'}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 justify-end flex-wrap">
                          {receipt.status === 'NEEDS_REVIEW' && (
                            <button
                              className="text-xs text-amber-600 font-medium underline whitespace-nowrap"
                              onClick={() => (isReviewing ? closeReview() : openReview(receipt))}
                            >
                              {isReviewing ? 'Cancel' : 'Review'}
                            </button>
                          )}
                          <button
                            className="text-xs text-muted-foreground underline whitespace-nowrap"
                            onClick={() => setExpandedId(isExpanded ? null : receipt.id)}
                          >
                            {isExpanded ? 'Collapse' : 'Details'}
                          </button>
                          {receipt.status === 'FAILED' && (
                            <button
                              className="text-xs text-blue-600 underline disabled:opacity-50 whitespace-nowrap"
                              disabled={retrying === receipt.id}
                              onClick={() => handleRetry(receipt.id)}
                            >
                              {retrying === receipt.id ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                          <button
                            className="text-xs text-destructive underline disabled:opacity-50 whitespace-nowrap"
                            disabled={deleting === receipt.id}
                            onClick={() => handleDelete(receipt.id)}
                          >
                            {deleting === receipt.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Link transaction sub-row */}
                    {isLinking && (
                      <tr key={`${receipt.id}-link`} className="border-b bg-blue-50/30">
                        <td colSpan={8} className="px-4 py-3">
                          <p className="text-xs font-medium mb-2">Link to a transaction</p>

                          {suggestionsLoading ? (
                            <p className="text-xs text-muted-foreground">Finding matches...</p>
                          ) : suggestions.length > 0 ? (
                            <div className="mb-3">
                              <p className="text-xs text-muted-foreground mb-1.5">Suggested matches</p>
                              <div className="space-y-1">
                                {suggestions.map(s => (
                                  <div key={s.id} className="flex items-center gap-3 text-xs p-2 bg-white rounded border">
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium truncate block">{s.description}</span>
                                      <span className="text-muted-foreground">
                                        {new Date(s.date).toLocaleDateString()} · {s.accountName}
                                        {s.reasoning && <> · <span className="text-blue-600">{s.reasoning}</span></>}
                                      </span>
                                    </div>
                                    <span className="font-medium shrink-0">
                                      {s.currency ? `${s.currency} ` : ''}{Math.abs(s.amount).toFixed(2)}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={linkingTxId === s.id}
                                      onClick={() => handleLinkTransaction(receipt.id, s.id)}
                                      className="text-xs h-6 px-2"
                                    >
                                      {linkingTxId === s.id ? '...' : 'Link'}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground mb-2">No close matches found.</p>
                          )}

                          {/* Manual search */}
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Search transactions by description..."
                              value={txSearch}
                              onChange={(e) => handleTxSearch(e.target.value)}
                              className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            {txSearching && <span className="text-xs text-muted-foreground">Searching...</span>}
                          </div>
                          {txSearchResults.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {txSearchResults.map(s => (
                                <div key={s.id} className="flex items-center gap-3 text-xs p-2 bg-white rounded border">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium truncate block">{s.description}</span>
                                    <span className="text-muted-foreground">
                                      {new Date(s.date).toLocaleDateString()} · {s.accountName}
                                    </span>
                                  </div>
                                  <span className="font-medium shrink-0">
                                    {s.currency ? `${s.currency} ` : ''}{Math.abs(s.amount).toFixed(2)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={linkingTxId === s.id}
                                    onClick={() => handleLinkTransaction(receipt.id, s.id)}
                                    className="text-xs h-6 px-2"
                                  >
                                    {linkingTxId === s.id ? '...' : 'Link'}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}

                    {/* Inline review sub-row */}
                    {isReviewing && reviewFields && (
                      <tr key={`${receipt.id}-review`} className="border-b bg-amber-50/40">
                        <td colSpan={8} className="px-4 py-3">
                          <p className="text-xs text-muted-foreground mb-3">Correct any errors then confirm.</p>
                          <div className="grid grid-cols-3 gap-2 max-w-xl">
                            {(['vendor', 'date', 'total', 'tax', 'paymentMethod', 'rawCategory'] as (keyof ReviewFields)[]).map(key => (
                              <div key={key} className="space-y-1">
                                <label className="text-xs text-muted-foreground capitalize">{key === 'rawCategory' ? 'Category' : key === 'paymentMethod' ? 'Payment' : key}</label>
                                <input
                                  className={inputClass}
                                  type={key === 'total' || key === 'tax' ? 'number' : 'text'}
                                  step={key === 'total' || key === 'tax' ? '0.01' : undefined}
                                  value={reviewFields[key]}
                                  placeholder={key === 'date' ? 'YYYY-MM-DD' : key === 'paymentMethod' ? 'cash, visa...' : key === 'rawCategory' ? 'groceries...' : undefined}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReviewField(key, e.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                          {reviewError && <p className="text-xs text-destructive mt-2">{reviewError}</p>}
                          <div className="flex items-center gap-2 mt-3">
                            <Button size="sm" disabled={confirming} onClick={() => handleConfirm(receipt.id)}>
                              {confirming ? 'Saving...' : 'Confirm & save'}
                            </Button>
                            <button className="text-xs text-muted-foreground underline" onClick={closeReview}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Expanded details sub-row */}
                    {isExpanded && !isReviewing && (
                      <tr key={`${receipt.id}-details`} className="border-b bg-muted/10">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex gap-6 flex-wrap">
                            {extracted && (
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs min-w-[200px]">
                                {extracted.subtotal != null && (<><span className="text-muted-foreground">Subtotal</span><span>{String(extracted.subtotal)}</span></>)}
                                {extracted.tax != null && (<><span className="text-muted-foreground">Tax</span><span>{String(extracted.tax)}</span></>)}
                                {extracted.paymentMethod && (<><span className="text-muted-foreground">Payment</span><span className="capitalize">{String(extracted.paymentMethod).replace('_', ' ')}</span></>)}
                                {extracted.rawCategory && (<><span className="text-muted-foreground">Category</span><span className="capitalize">{String(extracted.rawCategory).replace('_', ' ')}</span></>)}
                                {(extracted.items as unknown[])?.length > 0 && (
                                  <>
                                    <span className="text-muted-foreground col-span-2 pt-1 font-medium">Items</span>
                                    {(extracted.items as Array<{ name: string; totalPrice: number | null }>).map((item, i) => (
                                      <>
                                        <span key={`name-${i}`} className="truncate">{item.name}</span>
                                        <span key={`price-${i}`} className="text-right">{item.totalPrice ?? '—'}</span>
                                      </>
                                    ))}
                                  </>
                                )}
                              </div>
                            )}
                            {receipt.ocrMarkdown && (
                              <div className="flex-1 min-w-[200px]">
                                <p className="text-xs text-muted-foreground mb-1">OCR text</p>
                                <pre className="text-xs bg-muted/40 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">{receipt.ocrMarkdown}</pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

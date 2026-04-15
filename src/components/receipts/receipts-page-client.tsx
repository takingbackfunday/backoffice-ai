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
  if (status === 'READY') return 'Ready to bill'
  if (status === 'INVOICED') return 'Invoiced'
  return status
}

const inputClass =
  'w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring'

export function ReceiptsPageClient({ workspaces }: { workspaces: Workspace[] }) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewFields, setReviewFields] = useState<ReviewFields | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const loadReceipts = useCallback(async () => {
    const res = await fetch('/api/receipts')
    const json = await res.json()
    if (res.ok) setReceipts(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
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
      if (reviewingId === id) {
        setReviewingId(null)
        setReviewFields(null)
      }
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
      if (!res.ok) {
        setReviewError(json.error ?? 'Failed to confirm receipt')
        return
      }
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
    if (res.ok) {
      setReceipts((prev) => prev.map((r) => (r.id === receiptId ? json.data : r)))
    }
    setAssigningId(null)
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
      <div className="flex items-center justify-between">
        <Button onClick={() => setShowUpload((v) => !v)}>
          {showUpload ? 'Cancel' : '+ Upload receipt'}
        </Button>
      </div>

      {showUpload && (
        <div className="border rounded-lg p-4 bg-card">
          <ReceiptUpload onSuccess={handleUploadSuccess} />
        </div>
      )}

      {receipts.length === 0 && !showUpload && (
        <div className="text-sm text-muted-foreground text-center py-12">
          No receipts yet. Upload your first one above.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

          return (
            <div key={receipt.id} className="border rounded-lg overflow-hidden bg-card">
              {/* Thumbnail */}
              {receipt.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={receipt.thumbnailUrl}
                  alt="Receipt"
                  className="w-full h-32 object-cover cursor-zoom-in"
                  onClick={() => setLightboxUrl(receipt.thumbnailUrl!)}
                />
              )}

              <div className="p-3 space-y-2">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {extracted?.vendor ? String(extracted.vendor) : 'Unknown vendor'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {extracted?.date
                        ? String(extracted.date)
                        : new Date(receipt.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {extracted?.total && (
                      <p className="text-sm font-semibold">
                        {extracted.currency ? String(extracted.currency) + ' ' : ''}
                        {String(extracted.total)}
                      </p>
                    )}
                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full font-medium',
                        statusBadgeClass(receipt.status)
                      )}
                    >
                      {statusLabel(receipt.status)}
                    </span>
                  </div>
                </div>

                {/* Transaction link */}
                {receipt.transaction && (
                  <p className="text-xs text-muted-foreground truncate">
                    Linked: {receipt.transaction.description}
                  </p>
                )}

                {/* Workspace assignment — shown on READY and INVOICED receipts */}
                {(receipt.status === 'READY' || receipt.status === 'INVOICED') && (
                  <div className="flex items-center gap-1.5">
                    {receipt.workspace ? (
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs text-muted-foreground shrink-0">Client:</span>
                        <span className="text-xs font-medium truncate">{receipt.workspace.name}</span>
                        {receipt.status === 'READY' && (
                          <button
                            className="text-xs text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                            disabled={assigningId === receipt.id}
                            onClick={() => handleAssignWorkspace(receipt.id, null)}
                            title="Unassign client"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ) : workspaces.length > 0 ? (
                      <select
                        className="text-xs border border-border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                        defaultValue=""
                        disabled={assigningId === receipt.id}
                        onChange={(e) => {
                          if (e.target.value) handleAssignWorkspace(receipt.id, e.target.value)
                        }}
                      >
                        <option value="" disabled>Assign client…</option>
                        {workspaces.map((ws) => (
                          <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-muted-foreground">No clients yet</span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {receipt.status === 'NEEDS_REVIEW' && (
                    <button
                      className="text-xs text-amber-600 font-medium underline"
                      onClick={() => (isReviewing ? closeReview() : openReview(receipt))}
                    >
                      {isReviewing ? 'Cancel' : 'Review'}
                    </button>
                  )}
                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setExpandedId(isExpanded ? null : receipt.id)}
                  >
                    {isExpanded ? 'Collapse' : 'Details'}
                  </button>
                  {receipt.status === 'FAILED' && (
                    <button
                      className="text-xs text-blue-600 underline disabled:opacity-50"
                      disabled={retrying === receipt.id}
                      onClick={() => handleRetry(receipt.id)}
                    >
                      {retrying === receipt.id ? 'Retrying...' : 'Retry'}
                    </button>
                  )}
                  <button
                    className="text-xs text-destructive underline ml-auto disabled:opacity-50"
                    disabled={deleting === receipt.id}
                    onClick={() => handleDelete(receipt.id)}
                  >
                    {deleting === receipt.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>

                {/* Inline review panel */}
                {isReviewing && reviewFields && (
                  <div className="pt-2 border-t space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Correct any errors then confirm.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Vendor</label>
                        <input
                          className={inputClass}
                          value={reviewFields.vendor}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setReviewField('vendor', e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Date</label>
                        <input
                          className={inputClass}
                          value={reviewFields.date}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setReviewField('date', e.target.value)
                          }
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Total</label>
                        <input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          value={reviewFields.total}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setReviewField('total', e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Tax</label>
                        <input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          value={reviewFields.tax}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setReviewField('tax', e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Payment</label>
                        <input
                          className={inputClass}
                          value={reviewFields.paymentMethod}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setReviewField('paymentMethod', e.target.value)
                          }
                          placeholder="cash, visa..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Category</label>
                        <input
                          className={inputClass}
                          value={reviewFields.rawCategory}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setReviewField('rawCategory', e.target.value)
                          }
                          placeholder="groceries, dining..."
                        />
                      </div>
                    </div>
                    {reviewError && (
                      <p className="text-xs text-destructive">{reviewError}</p>
                    )}
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={confirming}
                      onClick={() => handleConfirm(receipt.id)}
                    >
                      {confirming ? 'Saving...' : 'Confirm & save'}
                    </Button>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && extracted && (
                  <div className="pt-2 border-t grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {extracted.subtotal !== null && extracted.subtotal !== undefined && (
                      <>
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{String(extracted.subtotal)}</span>
                      </>
                    )}
                    {extracted.tax !== null && extracted.tax !== undefined && (
                      <>
                        <span className="text-muted-foreground">Tax</span>
                        <span>{String(extracted.tax)}</span>
                      </>
                    )}
                    {extracted.paymentMethod && (
                      <>
                        <span className="text-muted-foreground">Payment</span>
                        <span className="capitalize">
                          {String(extracted.paymentMethod).replace('_', ' ')}
                        </span>
                      </>
                    )}
                    {extracted.rawCategory && (
                      <>
                        <span className="text-muted-foreground">Category</span>
                        <span className="capitalize">
                          {String(extracted.rawCategory).replace('_', ' ')}
                        </span>
                      </>
                    )}
                    {(extracted.items as unknown[])?.length > 0 && (
                      <>
                        <span className="text-muted-foreground col-span-2 pt-1 font-medium">
                          Items
                        </span>
                        {(
                          extracted.items as Array<{
                            name: string
                            totalPrice: number | null
                          }>
                        ).map((item, i) => (
                          <>
                            <span key={`name-${i}`} className="truncate">
                              {item.name}
                            </span>
                            <span key={`price-${i}`} className="text-right">
                              {item.totalPrice ?? '—'}
                            </span>
                          </>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {isExpanded && receipt.ocrMarkdown && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">OCR text</p>
                    <pre className="text-xs bg-muted/40 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {receipt.ocrMarkdown}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

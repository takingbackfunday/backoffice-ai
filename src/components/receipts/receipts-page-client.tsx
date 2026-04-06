'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ReceiptUpload, type ReceiptData } from './receipt-upload'

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
}

export function ReceiptsPageClient() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

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
    }
    setDeleting(null)
  }

  function handleUploadSuccess(receipt: ReceiptData) {
    setReceipts((prev) => [receipt as Receipt, ...prev])
    setShowUpload(false)
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
        <h1 className="text-xl font-semibold">Receipts</h1>
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
                        receipt.status === 'COMPLETED'
                          ? 'bg-green-100 text-green-700'
                          : receipt.status === 'FAILED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      )}
                    >
                      {receipt.status}
                    </span>
                  </div>
                </div>

                {/* Transaction link */}
                {receipt.transaction && (
                  <p className="text-xs text-muted-foreground truncate">
                    Linked: {receipt.transaction.description}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
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

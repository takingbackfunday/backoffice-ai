'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

async function compressImageClientSide(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const MAX_DIM = 1500
      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      const dataUri = canvas.toDataURL('image/jpeg', 0.8)
      resolve(dataUri)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export interface ReceiptData {
  id: string
  status: string
  thumbnailUrl: string | null
  ocrMarkdown: string | null
  extractedData: Record<string, unknown> | null
  createdAt: string
  transaction?: unknown
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

interface ReceiptUploadProps {
  onSuccess?: (receipt: ReceiptData) => void
}

const STEPS = [
  'Reading image...',
  'Running OCR...',
  'Extracting data...',
  'Saving receipt...',
]

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

const inputClass =
  'w-full border border-border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring'

export function ReceiptUpload({ onSuccess }: ReceiptUploadProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOcr, setShowOcr] = useState(false)
  const [fields, setFields] = useState<ReviewFields | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    setReceipt(null)
    setFields(null)
    setIsProcessing(true)
    setCurrentStep(0)

    try {
      setCurrentStep(0)
      const dataUri = await compressImageClientSide(file)

      setCurrentStep(1)
      const res = await fetch('/api/receipts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      })

      setCurrentStep(3)
      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Upload failed')
        return
      }

      const uploaded = json.data as ReceiptData
      setReceipt(uploaded)
      setFields(toReviewFields(uploaded.extractedData))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsProcessing(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function setField(key: keyof ReviewFields, value: string) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleConfirm() {
    if (!receipt || !fields) return
    setConfirming(true)
    setError(null)
    try {
      const original = (receipt.extractedData ?? {}) as Record<string, unknown>
      const updated: Record<string, unknown> = {
        ...original,
        vendor: fields.vendor || null,
        date: fields.date || null,
        total: fields.total !== '' ? parseFloat(fields.total) : null,
        subtotal: fields.subtotal !== '' ? parseFloat(fields.subtotal) : null,
        tax: fields.tax !== '' ? parseFloat(fields.tax) : null,
        paymentMethod: fields.paymentMethod || null,
        rawCategory: fields.rawCategory || null,
      }

      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedData: updated, confirmed: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to confirm receipt')
        return
      }
      const confirmed = json.data as ReceiptData
      setReceipt(confirmed)
      onSuccess?.(confirmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setConfirming(false)
    }
  }

  const needsReview = receipt?.status === 'NEEDS_REVIEW'

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center space-y-3',
          isProcessing ? 'border-muted opacity-60' : 'border-border'
        )}
      >
        <p className="text-sm text-muted-foreground">
          Photograph or screenshot a receipt
        </p>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleInputChange}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
        />
        <div className="flex gap-2 justify-center flex-wrap">
          <Button
            variant="outline"
            disabled={isProcessing}
            onClick={() => cameraRef.current?.click()}
          >
            Take photo
          </Button>
          <Button
            variant="outline"
            disabled={isProcessing}
            onClick={() => galleryRef.current?.click()}
          >
            Choose from gallery
          </Button>
        </div>
      </div>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground p-3 bg-muted/40 rounded-lg">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <span>{STEPS[currentStep]}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}

      {/* Review / result panel */}
      {receipt && fields && (
        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-3 bg-muted/40 border-b">
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                receipt.status === 'COMPLETED'
                  ? 'bg-green-100 text-green-700'
                  : receipt.status === 'FAILED'
                    ? 'bg-red-100 text-red-700'
                    : receipt.status === 'NEEDS_REVIEW'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-yellow-100 text-yellow-700'
              )}
            >
              {receipt.status === 'NEEDS_REVIEW' ? 'Review required' : receipt.status}
            </span>
            {receipt.status === 'COMPLETED' && (
              <span className="text-xs text-green-600 font-medium">Confirmed</span>
            )}
          </div>

          {needsReview ? (
            // Editable review form
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Check the extracted data below and correct any errors before confirming.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Vendor</label>
                  <input
                    className={inputClass}
                    value={fields.vendor}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField('vendor', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Date (YYYY-MM-DD)</label>
                  <input
                    className={inputClass}
                    value={fields.date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField('date', e.target.value)
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
                    value={fields.total}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField('total', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Subtotal</label>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={fields.subtotal}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField('subtotal', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tax</label>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={fields.tax}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField('tax', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Payment method</label>
                  <input
                    className={inputClass}
                    value={fields.paymentMethod}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField('paymentMethod', e.target.value)
                    }
                    placeholder="cash, visa, mastercard..."
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs text-muted-foreground">Category</label>
                  <input
                    className={inputClass}
                    value={fields.rawCategory}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField('rawCategory', e.target.value)
                    }
                    placeholder="groceries, dining, transport..."
                  />
                </div>
              </div>

              {/* Items read-only */}
              {Array.isArray(receipt.extractedData?.items) &&
                (receipt.extractedData.items as unknown[]).length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Line items (read-only)</p>
                    <div className="space-y-0.5">
                      {(
                        receipt.extractedData.items as Array<{
                          name: string
                          totalPrice: number | null
                        }>
                      ).map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="truncate">{item.name}</span>
                          <span className="shrink-0 ml-2">{item.totalPrice ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <Button className="w-full" disabled={confirming} onClick={handleConfirm}>
                {confirming ? 'Saving...' : 'Confirm & save'}
              </Button>
            </div>
          ) : (
            // Read-only completed view
            <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {fields.vendor && (
                <>
                  <span className="text-muted-foreground">Vendor</span>
                  <span>{fields.vendor}</span>
                </>
              )}
              {fields.date && (
                <>
                  <span className="text-muted-foreground">Date</span>
                  <span>{fields.date}</span>
                </>
              )}
              {fields.total && (
                <>
                  <span className="text-muted-foreground">Total</span>
                  <span>{fields.total}</span>
                </>
              )}
              {fields.subtotal && (
                <>
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{fields.subtotal}</span>
                </>
              )}
              {fields.tax && (
                <>
                  <span className="text-muted-foreground">Tax</span>
                  <span>{fields.tax}</span>
                </>
              )}
              {fields.paymentMethod && (
                <>
                  <span className="text-muted-foreground">Payment</span>
                  <span className="capitalize">{fields.paymentMethod.replace('_', ' ')}</span>
                </>
              )}
              {fields.rawCategory && (
                <>
                  <span className="text-muted-foreground">Category</span>
                  <span className="capitalize">{fields.rawCategory.replace('_', ' ')}</span>
                </>
              )}
            </div>
          )}

          {receipt.thumbnailUrl && (
            <div className="p-3 border-t">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receipt.thumbnailUrl}
                alt="Receipt thumbnail"
                className="max-h-40 rounded object-contain mx-auto"
              />
            </div>
          )}

          {receipt.ocrMarkdown && (
            <div className="border-t p-3">
              <button
                className="text-xs text-muted-foreground underline"
                onClick={() => setShowOcr((v) => !v)}
              >
                {showOcr ? 'Hide' : 'Show'} OCR text
              </button>
              {showOcr && (
                <pre className="mt-2 text-xs bg-muted/40 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {receipt.ocrMarkdown}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

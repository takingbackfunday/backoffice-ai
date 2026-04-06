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

interface ReceiptUploadProps {
  onSuccess?: (receipt: ReceiptData) => void
}

const STEPS = [
  'Reading image...',
  'Running OCR...',
  'Extracting data...',
  'Saving receipt...',
]

export function ReceiptUpload({ onSuccess }: ReceiptUploadProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOcr, setShowOcr] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    setReceipt(null)
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

      setReceipt(json.data)
      onSuccess?.(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsProcessing(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  // Cast Json field to a typed shape for rendering
  const extracted = receipt?.extractedData as {
    vendor?: string | null
    currency?: string | null
    total?: number | null
    date?: string | null
    subtotal?: number | null
    tax?: number | null
    paymentMethod?: string | null
    rawCategory?: string | null
  } | null

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
            📷 Take photo
          </Button>
          <Button
            variant="outline"
            disabled={isProcessing}
            onClick={() => galleryRef.current?.click()}
          >
            🖼 Choose from gallery
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

      {/* Result preview */}
      {receipt && (
        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-3 bg-muted/40 border-b">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  receipt.status === 'COMPLETED'
                    ? 'bg-green-100 text-green-700'
                    : receipt.status === 'FAILED'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                )}
              >
                {receipt.status}
              </span>
              {extracted?.vendor != null && (
                <span className="text-sm font-medium">{String(extracted.vendor)}</span>
              )}
            </div>
            {extracted?.total && (
              <span className="text-sm font-semibold">
                {extracted.currency ? String(extracted.currency) + ' ' : ''}
                {String(extracted.total)}
              </span>
            )}
          </div>

          <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {extracted?.date && (
              <>
                <span className="text-muted-foreground">Date</span>
                <span>{String(extracted.date)}</span>
              </>
            )}
            {extracted?.subtotal !== null && extracted?.subtotal !== undefined && (
              <>
                <span className="text-muted-foreground">Subtotal</span>
                <span>{String(extracted.subtotal)}</span>
              </>
            )}
            {extracted?.tax !== null && extracted?.tax !== undefined && (
              <>
                <span className="text-muted-foreground">Tax</span>
                <span>{String(extracted.tax)}</span>
              </>
            )}
            {extracted?.paymentMethod && (
              <>
                <span className="text-muted-foreground">Payment</span>
                <span className="capitalize">{String(extracted.paymentMethod).replace('_', ' ')}</span>
              </>
            )}
            {extracted?.rawCategory && (
              <>
                <span className="text-muted-foreground">Category</span>
                <span className="capitalize">{String(extracted.rawCategory).replace('_', ' ')}</span>
              </>
            )}
          </div>

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

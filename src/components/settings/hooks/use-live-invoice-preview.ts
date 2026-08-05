import { useEffect, useRef, useState } from 'react'

export function useLiveInvoicePreview(payloadJson: string): {
  previewUrl: string | null
  updating: boolean
  previewError: string | null
} {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previousUrlRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const delay = previewUrl ? 800 : 0

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      timerRef.current = null

      setUpdating(true)
      setPreviewError(null)

      try {
        const res = await fetch('/api/settings/preview-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
          signal: controller.signal,
        })

        if (!res.ok) {
          setPreviewError('Failed to generate preview')
          setUpdating(false)
          return
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)

        if (previousUrlRef.current) {
          URL.revokeObjectURL(previousUrlRef.current)
        }
        previousUrlRef.current = url
        setPreviewUrl(url)
      } catch {
        setPreviewError('Failed to generate preview')
      } finally {
        setUpdating(false)
      }
    }, delay)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [payloadJson]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current)
      }
    }
  }, [])

  return { previewUrl, updating, previewError }
}

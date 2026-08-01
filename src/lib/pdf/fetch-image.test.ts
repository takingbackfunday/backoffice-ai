import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchImageAsDataUri } from '@/lib/pdf/fetch-image'

function makeResponse(overrides: {
  ok?: boolean
  contentType?: string
  arrayBuffer?: ArrayBuffer
  reject?: Error
} = {}) {
  if (overrides.reject) {
    return vi.fn().mockRejectedValueOnce(overrides.reject)
  }
  return vi.fn().mockResolvedValueOnce({
    ok: overrides.ok ?? true,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? overrides.contentType ?? 'image/png' : null,
    },
    arrayBuffer: async () => overrides.arrayBuffer ?? new Uint8Array([0x89, 0x50]).buffer,
  })
}

describe('fetchImageAsDataUri', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a PNG data URI on success', async () => {
    globalThis.fetch = makeResponse({ contentType: 'image/png' }) as typeof fetch

    const result = await fetchImageAsDataUri('https://example.com/logo.png')
    expect(result).toBe(`data:image/png;base64,${Buffer.from([0x89, 0x50]).toString('base64')}`)
  })

  it('returns a JPEG data URI on success', async () => {
    globalThis.fetch = makeResponse({ contentType: 'image/jpeg' }) as typeof fetch

    const result = await fetchImageAsDataUri('https://example.com/logo.jpg')
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('returns null for a non-image content type', async () => {
    globalThis.fetch = makeResponse({ contentType: 'image/webp' }) as typeof fetch

    const result = await fetchImageAsDataUri('https://example.com/logo.webp')
    expect(result).toBeNull()
  })

  it('returns null when fetch rejects', async () => {
    globalThis.fetch = makeResponse({ reject: new Error('Network error') }) as typeof fetch

    const result = await fetchImageAsDataUri('https://example.com/logo.png')
    expect(result).toBeNull()
  })

  it('returns null for a non-ok response', async () => {
    globalThis.fetch = makeResponse({ ok: false }) as typeof fetch

    const result = await fetchImageAsDataUri('https://example.com/logo.png')
    expect(result).toBeNull()
  })

  it('returns null when fetch times out', async () => {
    globalThis.fetch = vi.fn((_url: string | Request | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    }) as typeof fetch

    const result = await fetchImageAsDataUri('https://example.com/logo.png', 50)
    expect(result).toBeNull()
  })
})

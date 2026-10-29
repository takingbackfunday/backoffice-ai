import { afterEach, describe, expect, it, vi } from 'vitest'
import { MistralOcrError, mistralOcr, mistralOcrPdf } from '@/lib/ocr/mistral'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mistralOcrPdf rate limiting', () => {
  it('retries a rate-limited request when Retry-After allows a quick retry', async () => {
    vi.stubEnv('MISTRAL_API_KEY', 'test-key')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Rate limit exceeded', {
        status: 429,
        headers: { 'Retry-After': '0' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        pages: [{ markdown: 'Statement text' }],
        usage_info: { pages_processed: 1, doc_size_bytes: 10 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(mistralOcrPdf('data:application/pdf;base64,JVBERi0=')).resolves.toEqual({
      markdown: 'Statement text',
      pagesProcessed: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('exponentially backs off and gives up after the retry cap when no Retry-After is sent', async () => {
    vi.useFakeTimers()
    vi.stubEnv('MISTRAL_API_KEY', 'test-key')
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response('Rate limit exceeded', { status: 429 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const err = mistralOcrPdf('data:application/pdf;base64,JVBERi0=').catch((e) => e)
    await vi.runAllTimersAsync()

    expect(await err).toMatchObject({ name: 'MistralOcrError', status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry before a long provider Retry-After and preserves its delay', async () => {
    vi.stubEnv('MISTRAL_API_KEY', 'test-key')
    const fetchMock = vi.fn().mockResolvedValue(new Response('Rate limit exceeded', {
      status: 429,
      headers: { 'Retry-After': '30' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(mistralOcrPdf('data:application/pdf;base64,JVBERi0=')).rejects.toMatchObject({
      name: 'MistralOcrError',
      status: 429,
      retryAfterSeconds: 30,
    } satisfies Partial<MistralOcrError>)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('mistralOcr rate limiting', () => {
  it('shares the retry behaviour for image OCR', async () => {
    vi.stubEnv('MISTRAL_API_KEY', 'test-key')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Rate limit exceeded', {
        status: 429,
        headers: { 'Retry-After': '0' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        pages: [{ markdown: 'Receipt text' }],
        usage_info: { pages_processed: 1, doc_size_bytes: 10 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(mistralOcr('data:image/jpeg;base64,/9j/4AAQ')).resolves.toEqual({
      markdown: 'Receipt text',
      pagesProcessed: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

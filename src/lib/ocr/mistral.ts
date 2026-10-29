const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr'
const OCR_TIMEOUT_MS = 90_000
const MAX_RATE_LIMIT_RETRIES = 2
const MAX_AUTORETRY_DELAY_MS = 5_000

export class MistralOcrError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'MistralOcrError'
  }
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000

  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

function retryAfterSeconds(value: string | null): number | undefined {
  const delayMs = retryAfterMs(value)
  return delayMs === null ? undefined : Math.ceil(delayMs / 1_000)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface MistralOcrPage {
  index: number
  markdown: string
  images: { id: string; image_base64: string | null }[]
  dimensions: { dpi: number; height: number; width: number }
}

interface MistralOcrResponse {
  pages: MistralOcrPage[]
  model: string
  usage_info: { pages_processed: number; doc_size_bytes: number | null }
}

type MistralDocument =
  | { type: 'image_url'; image_url: string }
  | { type: 'document_url'; document_url: string }

/**
 * POST a document to Mistral OCR, transparently retrying short rate-limit
 * responses (HTTP 429) that advertise a quick `Retry-After`. Longer waits are
 * not retried — instead a `MistralOcrError` carrying the provider's retry hint
 * is thrown so the caller can decide.
 */
async function postMistralOcr(
  document: MistralDocument,
  logTag: string,
  signal?: AbortSignal,
): Promise<MistralOcrResponse> {
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not set')

  let rateLimitRetries = 0
  while (true) {
    const res = await fetch(MISTRAL_OCR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'mistral-ocr-latest', document }),
      signal,
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[${logTag}:error]`, { status: res.status, body: text.slice(0, 300) })

      if (res.status === 429) {
        const providerDelayMs = retryAfterMs(res.headers.get('Retry-After'))
        const backoffMs = 1_000 * 2 ** rateLimitRetries
        const delayMs = providerDelayMs ?? backoffMs

        if (rateLimitRetries < MAX_RATE_LIMIT_RETRIES && delayMs <= MAX_AUTORETRY_DELAY_MS) {
          rateLimitRetries++
          console.log(`[${logTag}:retry]`, { attempt: rateLimitRetries, delayMs })
          await wait(delayMs)
          continue
        }

        throw new MistralOcrError(
          res.status,
          `Mistral OCR ${res.status}: ${text.slice(0, 200)}`,
          retryAfterSeconds(res.headers.get('Retry-After')),
        )
      }

      throw new MistralOcrError(res.status, `Mistral OCR ${res.status}: ${text.slice(0, 200)}`)
    }

    return (await res.json()) as MistralOcrResponse
  }
}

function toOcrResult(json: MistralOcrResponse): { markdown: string; pagesProcessed: number } {
  const markdown = json.pages.map((p) => p.markdown).join('\n\n')
  return { markdown, pagesProcessed: json.usage_info.pages_processed }
}

/**
 * Send a base64 image to Mistral OCR and get back markdown text.
 *
 * @param base64Image - Full data URI: "data:image/jpeg;base64,/9j/4AAQ..."
 * @returns The extracted markdown text from the first (only) page.
 */
export async function mistralOcr(base64Image: string): Promise<{
  markdown: string
  pagesProcessed: number
}> {
  const t0 = Date.now()
  const json = await postMistralOcr(
    { type: 'image_url', image_url: base64Image },
    'mistral-ocr',
  )
  const result = toOcrResult(json)

  console.log('[mistral-ocr:res]', {
    latencyMs: Date.now() - t0,
    pagesProcessed: result.pagesProcessed,
    markdownLength: result.markdown.length,
  })

  return result
}

/**
 * Send a base64 PDF to Mistral OCR and get back markdown text for all pages.
 *
 * @param base64Pdf - Full data URI: "data:application/pdf;base64,JVBERi0..."
 * @returns The extracted markdown text from all pages, joined with blank lines.
 */
export async function mistralOcrPdf(base64Pdf: string): Promise<{
  markdown: string
  pagesProcessed: number
}> {
  const t0 = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)
  try {
    const json = await postMistralOcr(
      { type: 'document_url', document_url: base64Pdf },
      'mistral-ocr-pdf',
      controller.signal,
    )
    const result = toOcrResult(json)

    console.log('[mistral-ocr-pdf:res]', {
      latencyMs: Date.now() - t0,
      pagesProcessed: result.pagesProcessed,
      markdownLength: result.markdown.length,
    })

    return result
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('Mistral OCR timed out after 90s')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

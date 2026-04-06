const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr'

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
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not set')

  const t0 = Date.now()
  const res = await fetch(MISTRAL_OCR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        image_url: base64Image,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[mistral-ocr:error]', { status: res.status, body: text.slice(0, 300) })
    throw new Error(`Mistral OCR ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as MistralOcrResponse
  const markdown = json.pages.map((p) => p.markdown).join('\n\n')

  console.log('[mistral-ocr:res]', {
    latencyMs: Date.now() - t0,
    pagesProcessed: json.usage_info.pages_processed,
    markdownLength: markdown.length,
  })

  return { markdown, pagesProcessed: json.usage_info.pages_processed }
}

import { logger } from '@/lib/log'

const TAVILY_API_URL = 'https://api.tavily.com/search'
const TIMEOUT_MS = 15_000
const MAX_RESULTS = 5

export interface TavilySearchResult {
  title: string
  url: string
  content: string
  score: number
}

export interface TavilyResponse {
  results: TavilySearchResult[]
  answer?: string
}

export class TavilyError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'TavilyError'
  }
}

export async function tavilySearch(
  query: string,
  opts?: { maxResults?: number; includeAnswer?: boolean },
): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new TavilyError(
      'Web search is not configured. Set TAVILY_API_KEY in your environment.',
    )
  }

  const maxResults = opts?.maxResults ?? MAX_RESULTS

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: opts?.includeAnswer ?? true,
        search_depth: 'basic',
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    throw new TavilyError(
      isTimeout
        ? `Web search timed out after ${TIMEOUT_MS / 1000}s`
        : `Web search request failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  clearTimeout(timeoutId)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    logger.error('tavily', 'search failed', { status: res.status, body: text.slice(0, 300) })
    throw new TavilyError(`Web search returned ${res.status}: ${text.slice(0, 200)}`, res.status)
  }

  const data = (await res.json()) as TavilyResponse
  logger.info('tavily', 'search ok', { query: query.slice(0, 100), resultCount: data.results?.length ?? 0 })
  return data
}

/** Format search results into a compact string suitable for LLM context. */
export function formatSearchResultsForLlm(response: TavilyResponse): string {
  const lines: string[] = []

  if (response.answer) {
    lines.push(`Summary: ${response.answer}`)
    lines.push('')
  }

  for (const r of response.results ?? []) {
    lines.push(`- ${r.title} (${r.url})`)
    lines.push(`  ${r.content.slice(0, 300)}`)
    lines.push('')
  }

  return lines.join('\n')
}

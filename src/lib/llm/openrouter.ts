// ── Logging ───────────────────────────────────────────────────────────────────

export const DEEPSEEK_MODEL = 'deepseek/deepseek-v4.1-flash-1017'

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4)
}

function logLlm(tag: string, data: Record<string, unknown>) {
  console.log(`[llm:${tag}]`, JSON.stringify(data))
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string   // required when role === 'tool'
  name?: string
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>  // JSON Schema object
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string  // JSON string
  }
}

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface OpenRouterRequestOptions {
  responseFormat?: { type: 'json_object' }
}

export interface ChatResponse {
  content: string | null
  tool_calls: ToolCall[] | null
  finish_reason: 'stop' | 'tool_calls' | 'length' | string
  usage?: Usage
}

// ── Token-streaming completion (for final answer pass) ────────────────────────

/** Stream a completion without tools, forwarding each content token to `onToken`.
 *  Returns the full accumulated text. Uses same retry/timeout as openrouterWithTools. */
export async function openrouterStream(
  messages: ChatMessage[],
  model: string,
  onToken: (text: string) => void,
): Promise<string> {
  const t0 = Date.now()
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * Math.pow(2, attempt - 1)
      logLlm('stream:retry', { model, attempt, delayMs })
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: 8192, stream: true }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError'
      lastError = new Error(isTimeout ? `OpenRouter stream timed out after ${STREAM_TIMEOUT_MS / 1000}s` : 'OpenRouter fetch failed')
      if (attempt < MAX_RETRIES) continue
      throw lastError
    }

    if (!res.ok) {
      clearTimeout(timeoutId)
      const text = await res.text()
      lastError = new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`)
      if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_RETRIES) continue
      throw lastError
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          let chunk: Record<string, unknown>
          try { chunk = JSON.parse(data) } catch { continue }
          const delta = (chunk.choices as { delta?: { content?: string } }[] | undefined)?.[0]?.delta
          if (delta?.content) {
            content += delta.content
            onToken(delta.content)
          }
        }
      }
    } catch (streamErr) {
      clearTimeout(timeoutId)
      reader.cancel().catch(() => {})
      const isTimeout = streamErr instanceof Error && streamErr.name === 'AbortError'
      lastError = new Error(isTimeout ? `OpenRouter stream timed out after ${STREAM_TIMEOUT_MS / 1000}s` : 'OpenRouter stream interrupted')
      if (attempt < MAX_RETRIES) continue
      throw lastError
    }

    clearTimeout(timeoutId)
    logLlm('stream:res', { model, latencyMs: Date.now() - t0, contentLen: content.length })
    return content
  }

  throw lastError ?? new Error('OpenRouter stream request failed after retries')
}

// ── Simple text completion (existing behaviour) ───────────────────────────────

export async function openrouterChat(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  model = DEEPSEEK_MODEL,
  maxTokens = 4096,
  timeoutMs?: number
): Promise<string> {
  const t0 = Date.now()
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential back-off: 2s, 4s
      const delayMs = 2000 * Math.pow(2, attempt - 1)
      logLlm('chat:retry', { model, attempt, delayMs })
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const controller = timeoutMs ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
        signal: controller?.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        logLlm('chat:error', { model, attempt, status: res.status, body: text.slice(0, 300) })
        lastError = new Error(`OpenRouter ${res.status}: ${text}`)
        if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_RETRIES) continue
        throw lastError
      }

      const json = (await res.json()) as { choices: { message: { content: string } }[] }
      const content = json.choices[0].message.content as string
      logLlm('chat:res', { model, latencyMs: Date.now() - t0, contentPreview: content.slice(0, 200) })
      return content
    } catch (err) {
      if (controller && err instanceof Error && err.name === 'AbortError') {
        throw new Error(`OpenRouter timed out after ${Math.round(timeoutMs! / 1000)}s`)
      }
      throw err
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  // All retries exhausted (only reachable if we continued on every attempt)
  throw lastError ?? new Error('OpenRouter request failed after retries')
}

// ── Image completion (vision models) ──────────────────────────────────────────

export interface ImageChatOptions {
  model?: string
  maxTokens?: number
  timeoutMs?: number
  responseFormat?: { type: 'json_object' }
}

export interface ImageChatResult {
  content: string
  usage?: Usage
}

/**
 * Send an image (data URI or public URL) to an OpenRouter vision model.
 */
export async function openrouterImageChat(
  systemPrompt: string,
  imageUrl: string,
  options: ImageChatOptions = {},
): Promise<ImageChatResult> {
  const {
    model = DEEPSEEK_MODEL,
    maxTokens = 4096,
    timeoutMs = 90_000,
    responseFormat,
  } = options
  const t0 = Date.now()
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * Math.pow(2, attempt - 1)
      logLlm('image:retry', { model, attempt, delayMs })
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extract the receipt data from this image.' },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
          max_tokens: maxTokens,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        logLlm('image:error', { model, attempt, status: res.status, body: text.slice(0, 300) })
        lastError = new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
        if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_RETRIES) continue
        throw lastError
      }

      const json = (await res.json()) as {
        choices: { message: { content: string | null } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const content = json.choices[0]?.message?.content
      if (!content) {
        lastError = new Error('OpenRouter returned an empty image extraction response')
        if (attempt < MAX_RETRIES) continue
        throw lastError
      }

      const usage = json.usage
        ? {
            inputTokens: json.usage.prompt_tokens ?? 0,
            outputTokens: json.usage.completion_tokens ?? 0,
          }
        : undefined

      logLlm('image:res', {
        model,
        latencyMs: Date.now() - t0,
        contentLength: content.length,
        usage,
      })
      return { content, usage }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(`OpenRouter image request timed out after ${Math.round(timeoutMs / 1000)}s`)
        if (attempt < MAX_RETRIES) continue
        throw lastError
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError ?? new Error('OpenRouter image request failed after retries')
}

// ── PDF completion (OCR via OpenRouter's file parser) ─────────────────────────

export type PdfParserEngine = 'mistral-ocr' | 'cloudflare-ai' | 'native'

export interface PdfChatOptions {
  model?: string
  maxTokens?: number
  timeoutMs?: number
  /** PDF parsing engine. Defaults to Mistral OCR, which handles scanned statements. */
  engine?: PdfParserEngine
}

export interface PdfChatResult {
  content: string
  usage?: Usage
}

/**
 * Send a base64 PDF to OpenRouter and run a chat completion over its parsed
 * content. OpenRouter's `mistral-ocr` parser uses OpenRouter's own Mistral
 * credentials, so this does not depend on the caller's `MISTRAL_API_KEY`.
 *
 * @param systemPrompt - Instructions for the downstream model.
 * @param pdfDataUri - Full data URI: "data:application/pdf;base64,JVBERi0..."
 */
export async function openrouterPdfChat(
  systemPrompt: string,
  pdfDataUri: string,
  options: PdfChatOptions = {},
): Promise<PdfChatResult> {
  const {
    model = DEEPSEEK_MODEL,
    maxTokens = 8192,
    timeoutMs = 120_000,
    engine = 'mistral-ocr',
  } = options
  const t0 = Date.now()
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * Math.pow(2, attempt - 1)
      logLlm('pdf:retry', { model, attempt, delayMs })
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extract every transaction from the attached bank statement.' },
                {
                  type: 'file',
                  file: { filename: 'statement.pdf', file_data: pdfDataUri },
                },
              ],
            },
          ],
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          plugins: [{ id: 'file-parser', pdf: { engine } }],
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        logLlm('pdf:error', { model, attempt, status: res.status, body: text.slice(0, 300) })
        lastError = new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
        if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_RETRIES) continue
        throw lastError
      }

      const json = (await res.json()) as {
        choices: { message: { content: string | null } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const content = json.choices[0]?.message?.content
      if (!content) {
        lastError = new Error('OpenRouter returned an empty PDF extraction response')
        if (attempt < MAX_RETRIES) continue
        throw lastError
      }

      const usage = json.usage
        ? {
            inputTokens: json.usage.prompt_tokens ?? 0,
            outputTokens: json.usage.completion_tokens ?? 0,
          }
        : undefined

      logLlm('pdf:res', {
        model,
        engine,
        latencyMs: Date.now() - t0,
        contentLength: content.length,
        usage,
      })
      return { content, usage }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(`OpenRouter PDF request timed out after ${Math.round(timeoutMs / 1000)}s`)
        if (attempt < MAX_RETRIES) continue
        throw lastError
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError ?? new Error('OpenRouter PDF request failed after retries')
}

// ── Tool-use completion (streaming to avoid serverless timeouts) ──────────────

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 2
// Per-attempt timeout: abort if the stream produces no [DONE] within this window.
// Reasoning/tool rounds with a large context can take 40-50s; 90s gives comfortable headroom
// while ensuring a hung connection fails and retries rather than blocking until the
// outer hard-timeout fires.
const STREAM_TIMEOUT_MS = 90_000

export async function openrouterWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  model = DEEPSEEK_MODEL,
  options: OpenRouterRequestOptions = {},
): Promise<ChatResponse> {
  const t0 = Date.now()

  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential back-off: 2s, 4s
      const delayMs = 2000 * Math.pow(2, attempt - 1)
      logLlm('tools:retry', { model, attempt, delayMs })
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          tool_choice: 'auto',
          max_tokens: 8192,
          stream: true,
          stream_options: { include_usage: true },
          ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError'
      logLlm('tools:fetch-error', { model, attempt, isTimeout, errorType: fetchErr instanceof Error ? fetchErr.name : 'UnknownError' })
      lastError = new Error(isTimeout ? `OpenRouter stream timed out after ${STREAM_TIMEOUT_MS / 1000}s` : `OpenRouter fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`)
      if (attempt < MAX_RETRIES) continue
      throw lastError
    }

    if (!res.ok) {
      clearTimeout(timeoutId)
      const text = await res.text()
      logLlm('tools:error', { model, attempt, status: res.status })
      // Surface context-length errors clearly
      const isContextLength = res.status === 400 && /context.length|too.long|max.token|prompt.length/i.test(text)
      if (isContextLength) {
        throw new Error('The transaction data is too large to analyse in one pass. Try running after categorising some transactions manually to reduce the uncategorised backlog.')
      }
      lastError = new Error(`OpenRouter request failed with status ${res.status}`)
      if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_RETRIES) continue
      throw lastError
    }

    // Accumulate streamed SSE chunks into a final ChatResponse
    let content = ''
    let finish_reason = 'stop'
    let usage: Usage | undefined
    // tool_calls indexed by index
    const toolCallMap: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {}

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break

          let chunk: Record<string, unknown>
          try { chunk = JSON.parse(data) } catch { continue }

          const choice = (chunk.choices as { delta?: Record<string, unknown>; finish_reason?: string }[] | undefined)?.[0]
          if (choice) {
            if (choice.finish_reason) finish_reason = choice.finish_reason

            const delta = choice.delta ?? {}

            if (typeof delta.content === 'string') content += delta.content

            const deltaToolCalls = delta.tool_calls as { index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[] | undefined
            if (deltaToolCalls) {
              for (const tc of deltaToolCalls) {
                const i = tc.index
                if (!toolCallMap[i]) {
                  toolCallMap[i] = { id: tc.id ?? '', type: tc.type ?? 'function', function: { name: tc.function?.name ?? '', arguments: '' } }
                } else {
                  if (tc.id) toolCallMap[i].id = tc.id
                  if (tc.function?.name) toolCallMap[i].function.name += tc.function.name
                }
                if (tc.function?.arguments) toolCallMap[i].function.arguments += tc.function.arguments
              }
            }
          }

          // Usage comes in a separate chunk (no choices) when stream_options.include_usage is set
          const chunkUsage = chunk.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
          if (chunkUsage) {
            usage = {
              inputTokens: chunkUsage.prompt_tokens ?? 0,
              outputTokens: chunkUsage.completion_tokens ?? 0,
            }
          }
        }
      }
    } catch (streamErr) {
      clearTimeout(timeoutId)
      reader.cancel().catch(() => {})
      const isTimeout = streamErr instanceof Error && streamErr.name === 'AbortError'
      logLlm('tools:stream-error', { model, attempt, isTimeout, errorType: streamErr instanceof Error ? streamErr.name : 'UnknownError' })
      lastError = new Error(isTimeout ? `OpenRouter stream timed out after ${STREAM_TIMEOUT_MS / 1000}s` : `OpenRouter stream interrupted: ${streamErr instanceof Error ? streamErr.message : String(streamErr)}`)
      if (attempt < MAX_RETRIES) continue
      throw lastError
    }

    clearTimeout(timeoutId)

    const tool_calls = Object.keys(toolCallMap).length > 0
      ? Object.values(toolCallMap) as ToolCall[]
      : null

    logLlm('tools:res', {
      model,
      latencyMs: Date.now() - t0,
      finish_reason,
      toolCalls: tool_calls?.map(t => t.function.name) ?? null,
    })

    return {
      content: content || null,
      tool_calls,
      finish_reason,
      usage,
    }
  }

  // All retries exhausted (only reachable if we continued on every attempt)
  throw lastError ?? new Error('OpenRouter request failed after retries')
}

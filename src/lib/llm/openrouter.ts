// ── Logging ───────────────────────────────────────────────────────────────────

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

export interface ChatResponse {
  content: string | null
  tool_calls: ToolCall[] | null
  finish_reason: 'stop' | 'tool_calls' | 'length' | string
}

// ── Simple text completion (existing behaviour) ───────────────────────────────

export async function openrouterChat(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  model = 'mistralai/devstral-small'
): Promise<string> {
  const t0 = Date.now()
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 4096 }),
  })

  if (!res.ok) {
    const text = await res.text()
    logLlm('chat:error', { model, status: res.status, body: text.slice(0, 300) })
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }

  const json = await res.json()
  const content = json.choices[0].message.content as string
  logLlm('chat:res', { model, latencyMs: Date.now() - t0, contentPreview: content.slice(0, 200) })
  return content
}

// ── Tool-use completion (streaming to avoid serverless timeouts) ──────────────

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 2
// Per-attempt timeout: abort if the stream produces no [DONE] within this window.
// Sonnet round-0 with a large context can take 40-50s; 90s gives comfortable headroom
// while ensuring a hung connection fails and retries rather than blocking until the
// outer hard-timeout fires.
const STREAM_TIMEOUT_MS = 90_000

export async function openrouterWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  model = 'mistralai/mistral-small-2603'
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
        }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError'
      logLlm('tools:fetch-error', { model, attempt, isTimeout, message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) })
      lastError = new Error(isTimeout ? `OpenRouter stream timed out after ${STREAM_TIMEOUT_MS / 1000}s` : `OpenRouter fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`)
      if (attempt < MAX_RETRIES) continue
      throw lastError
    }

    if (!res.ok) {
      clearTimeout(timeoutId)
      const text = await res.text()
      logLlm('tools:error', { model, attempt, status: res.status, body: text.slice(0, 300) })
      // Surface context-length errors clearly
      const isContextLength = res.status === 400 && /context.length|too.long|max.token|prompt.length/i.test(text)
      if (isContextLength) {
        throw new Error('The transaction data is too large to analyse in one pass. Try running after categorising some transactions manually to reduce the uncategorised backlog.')
      }
      lastError = new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`)
      if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_RETRIES) continue
      throw lastError
    }

    // Accumulate streamed SSE chunks into a final ChatResponse
    let content = ''
    let finish_reason = 'stop'
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
          if (!choice) continue

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
      }
    } catch (streamErr) {
      clearTimeout(timeoutId)
      reader.cancel().catch(() => {})
      const isTimeout = streamErr instanceof Error && streamErr.name === 'AbortError'
      logLlm('tools:stream-error', { model, attempt, isTimeout, message: streamErr instanceof Error ? streamErr.message : String(streamErr) })
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
    }
  }

  // All retries exhausted (only reachable if we continued on every attempt)
  throw lastError ?? new Error('OpenRouter request failed after retries')
}

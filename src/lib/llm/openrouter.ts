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
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }

  const json = await res.json()
  return json.choices[0].message.content as string
}

// ── Tool-use completion ────────────────────────────────────────────────────────

export async function openrouterWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  model = 'minimax/minimax-m2.7'
): Promise<ChatResponse> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      max_tokens: 4096,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }

  const json = await res.json()
  const choice = json.choices[0]
  return {
    content: choice.message.content ?? null,
    tool_calls: choice.message.tool_calls ?? null,
    finish_reason: choice.finish_reason,
  }
}

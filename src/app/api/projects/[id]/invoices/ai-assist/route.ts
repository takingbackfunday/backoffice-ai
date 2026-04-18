import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { badRequest, unauthorized, notFound } from '@/lib/api-response'
import { openrouterWithTools } from '@/lib/llm/openrouter'
import type { ChatMessage, ToolDefinition, ToolCall } from '@/lib/llm/openrouter'
import { query_transactions, aggregate_transactions } from '@/lib/agent/finance-tools'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
})

const CurrentInvoiceSchema = z.object({
  lineItems: z.array(LineItemSchema),
  tax: z.object({ label: z.string(), amount: z.number() }).nullable().optional(),
  dueDate: z.string().optional(),
  issueDate: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
  subtotal: z.number().optional(),
  total: z.number().optional(),
})

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  currentInvoice: CurrentInvoiceSchema,
  clientName: z.string().optional(),
  company: z.string().nullable().optional(),
  paymentTermDays: z.number().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

// Tools the invoice AI can use to look up real project expenses
const INVOICE_AI_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_project_expenses',
      description: 'Look up transactions tagged to this client project. Use to find billable expenses, time-based charges, or costs to include in the invoice. Returns a list of recent transactions with amounts, descriptions, dates.',
      parameters: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'End date YYYY-MM-DD' },
          descriptionContains: { type: 'string', description: 'Filter by description keyword' },
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aggregate_project_expenses',
      description: 'Get total expenses for this project grouped by category or month. Use to summarise billable costs.',
      parameters: {
        type: 'object',
        required: ['groupBy'],
        properties: {
          groupBy: { type: 'string', enum: ['month', 'category', 'payee'], description: 'Group dimension' },
          dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
      },
    },
  },
]

function parseInvoiceJson(raw: string): { text: string; actions: unknown[] } | null {
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]
  try {
    const parsed = JSON.parse(jsonStr)
    return { text: parsed.text ?? '', actions: parsed.actions ?? [] }
  } catch {
    return null
  }
}

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

/** One streaming pass against OpenRouter.
 *  - Content tokens are forwarded to `controller` immediately as `{ type: 'token' }` events.
 *  - If the model decides to call tools instead, tokens are NOT forwarded and tool_calls are returned.
 *  Returns { content, tool_calls } — tool_calls is non-null when the model issued tool calls. */
async function streamingPass(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  model: string,
  controller: ReadableStreamDefaultController,
  forwardTokens: boolean,
): Promise<{ content: string; tool_calls: ToolCall[] | null }> {
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
      max_tokens: 8192,
      stream: true,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  const toolCallMap: Record<number, ToolCall> = {}

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

      const choice = (chunk.choices as { delta?: Record<string, unknown> }[] | undefined)?.[0]
      if (!choice) continue
      const delta = choice.delta ?? {}

      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content
        if (forwardTokens) {
          controller.enqueue(sseEvent({ type: 'token', text: delta.content }))
        }
      }

      const deltaToolCalls = delta.tool_calls as { index: number; id?: string; function?: { name?: string; arguments?: string } }[] | undefined
      if (deltaToolCalls) {
        for (const tc of deltaToolCalls) {
          const i = tc.index
          if (!toolCallMap[i]) toolCallMap[i] = { id: tc.id ?? '', type: 'function', function: { name: tc.function?.name ?? '', arguments: '' } }
          else {
            if (tc.id) toolCallMap[i].id = tc.id
            if (tc.function?.name) toolCallMap[i].function.name += tc.function.name
          }
          if (tc.function?.arguments) toolCallMap[i].function.arguments += tc.function.arguments
        }
      }
    }
  }

  const tool_calls = Object.keys(toolCallMap).length > 0 ? Object.values(toolCallMap) : null
  return { content, tool_calls }
}

/** Stream a final (no-tools) answer, forwarding tokens directly to the client. */
async function streamFinalAnswer(
  messages: ChatMessage[],
  model: string,
  controller: ReadableStreamDefaultController,
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 4096, stream: true }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

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
        controller.enqueue(sseEvent({ type: 'token', text: delta.content }))
      }
    }
  }

  return content
}

export async function POST(request: Request, { params }: RouteParams) {
  const { userId: rawUserId } = await auth()
  if (!rawUserId) return unauthorized()
  const userId: string = rawUserId
  const { id } = await params

  const body = await request.json()
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

  const { messages, currentInvoice, clientName, company, paymentTermDays } = parsed.data
  const today = new Date().toISOString().split('T')[0]

  const projectWithJobs = await prisma.workspace.findFirst({
    where: { id, userId },
    select: { id: true, name: true, clientProfile: { select: { jobs: { select: { id: true, name: true }, where: { status: 'ACTIVE' } } } } },
  })
  if (!projectWithJobs) return notFound('Project not found')
  const project = projectWithJobs
  const availableJobs = projectWithJobs.clientProfile?.jobs ?? []

  const systemPrompt = `You are an invoice assistant for a freelance professional.
Today: ${today}. Client: ${clientName ?? 'the client'}${company ? ` (${company})` : ''}. Payment terms: ${paymentTermDays ?? 30} days net.
Project name in the finance system: "${project.name}".
${availableJobs.length > 0 ? `Available jobs: ${availableJobs.map(j => `"${j.name}" (id: ${j.id})`).join(', ')}.` : ''}

Current invoice state:
${JSON.stringify(currentInvoice, null, 2)}

The user will describe work done, request changes, or ask questions.
You have tools to look up real transactions tagged to this project — use them when the user asks about expenses, costs, or what to bill.

After any tool calls, respond with JSON ONLY — no prose outside the JSON object:
{
  "text": "friendly 1-2 sentence confirmation of what you did or answered",
  "actions": [
    { "type": "set_line_items", "lineItems": [{ "description": "...", "quantity": 1, "unitPrice": 0 }] },
    { "type": "set_due_date", "value": "YYYY-MM-DD" },
    { "type": "set_issue_date", "value": "YYYY-MM-DD" },
    { "type": "set_notes", "value": "..." },
    { "type": "set_tax", "label": "GST 15%", "amount": 262.50 },
    { "type": "set_currency", "value": "EUR" },
    { "type": "set_job", "jobId": "<id from available jobs list>" },
    { "type": "set_qty_unit", "lineItemIndex": 0, "unit": "hrs" },
    { "type": "ask_clarification", "question": "..." }
  ]
}

Rules:
- Never invent amounts. Use tool data or ask if unclear.
- Preserve existing line items unless user asks to change them.
- Default due date = today + ${paymentTermDays ?? 30} days if not set.
- Only include actions that actually change something.
- The "actions" array can be empty if user is only asking a question.
- For ask_clarification: include no other actions — just the question.
- For set_currency: use ISO 4217 codes (USD, EUR, GBP, CAD, AUD, etc.).
- For set_job: only use job IDs from the available jobs list above.
- For set_qty_unit: use short unit labels like "hrs", "days", "wks", "pages", "words", "units".`

  const llmMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  async function executeToolCalls(toolCalls: ToolCall[]) {
    for (const tc of toolCalls) {
      let toolResult: string
      try {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        if (tc.function.name === 'lookup_project_expenses') {
          toolResult = await query_transactions(userId, {
            projectNames: [project.name],
            dateFrom: args.dateFrom as string | undefined,
            dateTo: args.dateTo as string | undefined,
            descriptionContains: args.descriptionContains as string | undefined,
            limit: (args.limit as number | undefined) ?? 50,
          })
        } else if (tc.function.name === 'aggregate_project_expenses') {
          toolResult = await aggregate_transactions(userId, {
            groupBy: (args.groupBy as 'month' | 'category' | 'payee') ?? 'category',
            projectNames: [project.name],
            dateFrom: args.dateFrom as string | undefined,
            dateTo: args.dateTo as string | undefined,
          })
        } else {
          toolResult = 'Unknown tool'
        }
      } catch {
        toolResult = 'Tool execution failed'
      }
      llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult })
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Round 0: stream with tools enabled, forwarding content tokens immediately.
        // Claude returns content: null when calling tools, so no garbage leaks to the client.
        // - If no tools called: tokens already flowed to the client. Emit done event.
        // - If tools called: execute them, then stream the final answer.
        const round0 = await streamingPass(llmMessages, INVOICE_AI_TOOLS, 'anthropic/claude-sonnet-4.6', controller, true)

        if (!round0.tool_calls || round0.tool_calls.length === 0) {
          // Tokens were already forwarded; just send the done event with parsed actions
          const parsed = parseInvoiceJson(round0.content)
          controller.enqueue(sseEvent({ type: 'done', text: parsed?.text ?? round0.content, actions: parsed?.actions ?? [] }))
          controller.close()
          return
        }

        // Tools were called — Claude emits null content during tool calls so nothing leaked.
        // Show a status indicator while we execute tools.
        controller.enqueue(sseEvent({ type: 'status', text: 'Looking up project expenses…' }))

        const assistantMsg0: Record<string, unknown> = { role: 'assistant' }
        if (round0.content) assistantMsg0.content = round0.content
        assistantMsg0.tool_calls = round0.tool_calls
        llmMessages.push(assistantMsg0 as unknown as ChatMessage)
        await executeToolCalls(round0.tool_calls)

        // Up to 2 more tool rounds (non-streaming, tools may chain)
        for (let round = 1; round < 3; round++) {
          const next = await openrouterWithTools(llmMessages, INVOICE_AI_TOOLS, 'anthropic/claude-sonnet-4.6')
          if (!next.tool_calls || next.tool_calls.length === 0) break
          const assistantMsg: Record<string, unknown> = { role: 'assistant' }
          if (next.content) assistantMsg.content = next.content
          assistantMsg.tool_calls = next.tool_calls
          llmMessages.push(assistantMsg as unknown as ChatMessage)
          await executeToolCalls(next.tool_calls)
        }

        // Final answer — stream tokens now that we have tool results
        const fullText = await streamFinalAnswer(llmMessages, 'anthropic/claude-sonnet-4.6', controller)
        const result = parseInvoiceJson(fullText)
        controller.enqueue(sseEvent({ type: 'done', text: result?.text ?? fullText, actions: result?.actions ?? [] }))
        controller.close()
      } catch (err) {
        console.error('[ai-assist]', err)
        controller.enqueue(sseEvent({ type: 'error', text: 'Failed to get AI response' }))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { openrouterWithTools, type ChatMessage } from '@/lib/llm/openrouter'
import { FINANCE_TOOLS, dispatchTool } from '@/lib/agent/finance-tools'

interface SseEvent {
  type: 'status' | 'answer' | 'done' | 'error'
  message?: string
  answer?: string
  error?: string
}

function encode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

const MAX_TOOL_ROUNDS = 8

const SYSTEM_PROMPT = `You are a personal finance assistant with access to a set of database tools.

Use the tools to look up whatever data you need to answer the user's question accurately. You can call multiple tools in sequence — for example, call get_categories first to discover exact category names, then aggregate_transactions to get totals.

Guidelines:
- Always use the most efficient tool for the job (aggregate_transactions for totals, query_transactions for individual rows)
- When asked about a specific period, always filter by date
- When asked "why" something is high/low, drill into the details with query_transactions
- Be specific and data-driven in your answers — cite actual amounts, dates, payee names
- Keep answers concise but complete — bullet points are fine, no markdown headers
- Plain text only, no markdown formatting`

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  let question: string
  try {
    const body = await request.json()
    question = (body.question ?? '').trim()
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!question) return new Response('Missing question', { status: 400 })

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SseEvent) { controller.enqueue(encode(event)) }

      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'))
      }, 5000)

      try {
        // ── Build a lightweight financial snapshot for context ──────────────
        send({ type: 'status', message: 'Loading your financial overview…' })

        const [txCount, accounts, activeRules] = await Promise.all([
          prisma.transaction.count({ where: { account: { userId } } }),
          prisma.account.findMany({ where: { userId }, select: { name: true, currency: true } }),
          prisma.categorizationRule.count({ where: { userId, isActive: true } }),
        ])

        const dateRange = await prisma.transaction.aggregate({
          where: { account: { userId } },
          _min: { date: true },
          _max: { date: true },
        })

        const snapshot = `Financial database snapshot:
- Accounts: ${accounts.map(a => `${a.name} (${a.currency})`).join(', ')}
- Transactions: ${txCount} total
- Date range: ${dateRange._min.date?.toISOString().slice(0, 10) ?? 'n/a'} → ${dateRange._max.date?.toISOString().slice(0, 10) ?? 'n/a'}
- Active rules: ${activeRules}
Use the tools to query any data you need.`

        // ── Agentic tool loop ──────────────────────────────────────────────
        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${snapshot}\n\nQuestion: ${question}` },
        ]

        send({ type: 'status', message: 'Thinking…' })

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await openrouterWithTools(messages, FINANCE_TOOLS)

          // Append assistant turn
          messages.push({
            role: 'assistant',
            content: response.content ?? '',
            ...(response.tool_calls ? { tool_calls: response.tool_calls } as unknown as Record<string, unknown> : {}),
          } as ChatMessage)

          // No tool calls → final answer
          if (!response.tool_calls || response.tool_calls.length === 0) {
            const answer = (response.content ?? '').trim()
            send({ type: 'answer', answer })
            send({ type: 'done' })
            return
          }

          // Execute all tool calls in this round
          for (const tc of response.tool_calls) {
            const toolName = tc.function.name
            let args: unknown
            try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

            send({ type: 'status', message: `Querying ${toolName.replace(/_/g, ' ')}…` })

            let result: string
            try {
              result = await dispatchTool(userId, toolName, args)
            } catch (e) {
              result = `Error: ${e instanceof Error ? e.message : String(e)}`
            }

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result,
            })
          }
        }

        // Exceeded max rounds — ask for a final answer with what we have
        send({ type: 'status', message: 'Composing answer…' })
        messages.push({ role: 'user', content: 'Please give your final answer now based on the data you have gathered.' })
        const final = await openrouterWithTools(messages, [])
        send({ type: 'answer', answer: (final.content ?? 'Unable to answer.').trim() })
        send({ type: 'done' })

      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        clearInterval(keepAlive)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

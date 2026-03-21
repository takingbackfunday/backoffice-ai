import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { openrouterChat, openrouterWithTools, type ChatMessage } from '@/lib/llm/openrouter'
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

const ROUTER_MODEL = 'google/gemini-2.0-flash-lite-001'
const SIMPLE_MODEL = 'anthropic/claude-sonnet-4.6'
const COMPLEX_MODEL = 'anthropic/claude-opus-4-6'

const MAX_TOOL_ROUNDS_SIMPLE = 4
const MAX_TOOL_ROUNDS_COMPLEX = 8

async function routeQuestion(question: string): Promise<'simple' | 'complex'> {
  const prompt = `You are a router. Classify this finance question as "simple" or "complex".

Simple: single category/account total, recent transactions list, payee lookup, basic balance query.
Complex: multi-period comparisons, "why is X high", trend/anomaly analysis, questions spanning multiple categories or accounts.

Reply with exactly one word: simple or complex.

Question: ${question}`

  try {
    const result = await openrouterChat(
      [{ role: 'user', content: prompt }],
      ROUTER_MODEL
    )
    const word = result.trim().toLowerCase()
    return word.startsWith('complex') ? 'complex' : 'simple'
  } catch {
    // Default to simple on router failure — Sonnet is still good
    return 'simple'
  }
}

const SYSTEM_PROMPT = `You are a personal finance assistant with access to a set of database tools.

Use the tools to look up whatever data you need to answer the user's question accurately. You can call multiple tools in sequence — for example, call get_categories first to discover exact category names, then aggregate_transactions to get totals.

CRITICAL RULES — follow these exactly:
1. NEVER state a dollar amount you have not directly read from a tool result. No estimates, no sums in your head, no invented figures.
2. For any total/sum, call aggregate_transactions — do NOT compute it yourself from a list of rows.
3. For "why is X high", first call aggregate_transactions with categoryNames filter and date range to get the real total, then call query_transactions to list the individual transactions. Report ONLY what the tools returned.
4. If a category name is unknown, call get_categories first to find the exact name.
5. When asked about a specific time period, always pass dateFrom and dateTo to every tool call.
6. Do not confuse different categories — Bank Fees transactions are NOT the same as tax payments or transfers, even if they appear in the same account.
7. When analysing expenses, spending, income, or revenue, EXCLUDE all categories listed under NON-DEDUCTIBLE CATEGORIES in the snapshot below — these are internal money movements (transfers, owner draws, etc.), not real income or expenses. The exact category names are given to you — always pass them as an exclusion filter. If the user explicitly asks about transfers or those specific categories, you may include them.

Guidelines:
- Always use the most efficient tool for the job (aggregate_transactions for totals, query_transactions for individual rows)
- When asked about a specific period, always filter by date
- Be specific and data-driven — cite only actual amounts from tool results
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

        const [txCount, accounts, activeRules, nonDeductibleGroups] = await Promise.all([
          prisma.transaction.count({ where: { account: { userId } } }),
          prisma.account.findMany({ where: { userId }, select: { name: true, currency: true } }),
          prisma.categorizationRule.count({ where: { userId, isActive: true } }),
          prisma.categoryGroup.findMany({
            where: { userId, taxType: 'non_deductible' },
            select: { name: true, categories: { select: { name: true } } },
          }),
        ])

        const dateRange = await prisma.transaction.aggregate({
          where: { account: { userId } },
          _min: { date: true },
          _max: { date: true },
        })

        const nonDeductibleCategoryNames = nonDeductibleGroups.flatMap(g => g.categories.map(c => c.name))

        const snapshot = `Financial database snapshot:
- Accounts: ${accounts.map(a => `${a.name} (${a.currency})`).join(', ')}
- Transactions: ${txCount} total
- Date range: ${dateRange._min.date?.toISOString().slice(0, 10) ?? 'n/a'} → ${dateRange._max.date?.toISOString().slice(0, 10) ?? 'n/a'}
- Active rules: ${activeRules}

NON-DEDUCTIBLE CATEGORIES (ALWAYS exclude from revenue/expense/spending analysis unless the user specifically asks about them):
${nonDeductibleCategoryNames.length ? nonDeductibleCategoryNames.map(n => `  - ${n}`).join('\n') : '  (none configured)'}

Use the tools to query any data you need.`

        // ── Route question to appropriate model ────────────────────────────
        send({ type: 'status', message: 'Routing…' })
        const t0 = Date.now()
        const complexity = await routeQuestion(question)
        const model = complexity === 'complex' ? COMPLEX_MODEL : SIMPLE_MODEL
        const maxRounds = complexity === 'complex' ? MAX_TOOL_ROUNDS_COMPLEX : MAX_TOOL_ROUNDS_SIMPLE
        console.log('[ask-agent] start', JSON.stringify({ question: question.slice(0, 200), complexity, model, maxRounds }))

        // ── Agentic tool loop ──────────────────────────────────────────────
        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${snapshot}\n\nQuestion: ${question}` },
        ]

        send({ type: 'status', message: complexity === 'complex' ? 'Thinking deeply…' : 'Thinking…' })

        for (let round = 0; round < maxRounds; round++) {
          const response = await openrouterWithTools(messages, FINANCE_TOOLS, model)

          // Append assistant turn
          messages.push({
            role: 'assistant',
            content: response.content ?? '',
            ...(response.tool_calls ? { tool_calls: response.tool_calls } as unknown as Record<string, unknown> : {}),
          } as ChatMessage)

          // No tool calls → final answer
          if (!response.tool_calls || response.tool_calls.length === 0) {
            const answer = (response.content ?? '').trim()
            console.log('[ask-agent] done', JSON.stringify({ rounds: round + 1, totalMs: Date.now() - t0, answerLen: answer.length, answerPreview: answer.slice(0, 300) }))
            send({ type: 'answer', answer })
            send({ type: 'done' })
            return
          }

          // Execute all tool calls in this round
          for (const tc of response.tool_calls) {
            const toolName = tc.function.name
            let args: unknown
            try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

            console.log('[ask-agent] tool:call', JSON.stringify({ round: round + 1, tool: toolName, args }))
            send({ type: 'status', message: `Querying ${toolName.replace(/_/g, ' ')}…` })

            const tTool = Date.now()
            let result: string
            try {
              result = await dispatchTool(userId, toolName, args)
            } catch (e) {
              result = `Error: ${e instanceof Error ? e.message : String(e)}`
            }

            console.log('[ask-agent] tool:result', JSON.stringify({ tool: toolName, latencyMs: Date.now() - tTool, resultLen: result.length, preview: result.slice(0, 300) }))
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
        const final = await openrouterWithTools(messages, [], model)
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

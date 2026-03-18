import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { openrouterWithTools, type ChatMessage } from '@/lib/llm/openrouter'
import {
  RULES_TOOLS,
  dispatchRulesTool,
  loadRulesContext,
  type RulesSseEvent,
  type RulesContext,
} from '@/lib/agent/rules-tools'

// ── SSE helper ────────────────────────────────────────────────────────────────

function encode(event: RulesSseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a financial categorisation assistant. Analyse the user's transactions and suggest automation rules using the tools provided.

The initial data snapshot (uncategorised transactions, categories, no-payee transactions) is already provided in the user message — you do NOT need to call get_uncategorised_transactions, get_categories, or get_no_payee_transactions to start.

Workflow:
1. Analyse the pre-loaded data already in the prompt
2. Use get_rules ONCE if you want to check existing coverage
3. Use query_transactions or search_transactions (max 2 calls total) ONLY if you need to investigate a specific pattern more deeply
4. Emit ALL your suggestions by calling emit_rule_suggestion for each clear pattern
5. Call finish_analysis immediately after your last suggestion

CRITICAL constraints:
- Do NOT call get_uncategorised_transactions, get_categories, or get_no_payee_transactions — this data is already in the prompt
- Do NOT loop back to investigate after emitting — emit all at once then finish
- Never use amount as the only condition — always use description or payeeName
- categoryName must exactly match one of the category names provided
- Each suggestion covers distinct transactions (emit_rule_suggestion will reject duplicates)
- 2+ matching transactions required for high confidence; 1 acceptable for medium
- reasoning is 1 sentence
- Aim for 5–20 high-quality suggestions, not quantity
- Prioritise patterns from the last 18 months; include older patterns only if they recur frequently
- Prioritise by financial impact (highest absolute spend first) — a single large uncategorised vendor matters more than many small ones`

const MAX_TOOL_ROUNDS = 12

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: RulesSseEvent) {
        controller.enqueue(encode(event))
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'))
      }, 5000)

      try {
        // ── Step 1: lightweight snapshot for initial prompt ────────────────
        send({ type: 'status', message: 'Loading your financial data…' })

        const recentCutoff = new Date()
        recentCutoff.setMonth(recentCutoff.getMonth() - 18)

        const [txCount, uncatCount, noPayeeCount, activeRuleCount, recentUncatCount] = await Promise.all([
          prisma.transaction.count({ where: { account: { userId } } }),
          prisma.transaction.count({ where: { account: { userId }, categoryId: null } }),
          prisma.transaction.count({
            where: { account: { userId }, categoryId: { not: null }, payeeId: null },
          }),
          prisma.categorizationRule.count({ where: { userId, isActive: true } }),
          prisma.transaction.count({
            where: { account: { userId }, categoryId: null, date: { gte: recentCutoff } },
          }),
        ])

        const dateRange = await prisma.transaction.aggregate({
          where: { account: { userId } },
          _min: { date: true },
          _max: { date: true },
        })

        const snapshot = `Financial database snapshot:
- Total transactions: ${txCount} (date range: ${dateRange._min.date?.toISOString().slice(0, 10) ?? 'n/a'} → ${dateRange._max.date?.toISOString().slice(0, 10) ?? 'n/a'})
- Uncategorised transactions: ${uncatCount} total, ${recentUncatCount} in the last 18 months
- Transactions with category but no payee: ${noPayeeCount}
- Active categorisation rules: ${activeRuleCount}

Focus first on patterns from the last 18 months (since ${recentCutoff.toISOString().slice(0, 10)}). The full history is available via query_transactions if a pattern spans a longer period.`

        // ── Step 2: pre-load context + pre-fetch all data ─────────────────
        send({ type: 'status', message: 'Pre-loading transaction index…' })

        const preloaded = await loadRulesContext(userId)

        const ctx: RulesContext = {
          send,
          ...preloaded,
          coveredThisRun: new Set<string>(),
        }

        // Pre-fetch all data the LLM would normally call tools to get.
        // Injecting it directly means the LLM only needs ONE round (emit + finish).
        send({ type: 'status', message: 'Fetching transaction data…' })
        const [uncatData, catsData, noPayeeData] = await Promise.all([
          dispatchRulesTool(userId, 'get_uncategorised_transactions', { topN: 20 }, ctx),
          dispatchRulesTool(userId, 'get_categories', {}, ctx),
          dispatchRulesTool(userId, 'get_no_payee_transactions', { topN: 15 }, ctx),
        ])

        // ── Step 3: single LLM round to emit suggestions ──────────────────
        send({ type: 'status', message: 'Ready — starting analysis…' })

        const userMessage = `${snapshot}

--- UNCATEGORISED TRANSACTIONS ---
${uncatData}

--- AVAILABLE CATEGORIES ---
${catsData}

--- TRANSACTIONS WITH CATEGORY BUT NO PAYEE ---
${noPayeeData}

Now emit all rule suggestions using emit_rule_suggestion, then call finish_analysis.`

        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ]

        let finished = false
        let everEmitted = false  // true once any emit_rule_suggestion has been called
        let emitCount = 0
        const MAX_EMITS = 20
        let queryCount = 0
        const MAX_QUERIES = 2  // hard cap on query_transactions / search_transactions calls

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          console.log(`[rules-agent] round ${round + 1}, messages:`, messages.length, 'last role:', messages[messages.length-1]?.role)
          const response = await openrouterWithTools(messages, RULES_TOOLS, 'mistralai/mistral-small-2603')

          // Push assistant message
          messages.push({
            role: 'assistant',
            content: response.content ?? '',
            ...(response.tool_calls
              ? ({ tool_calls: response.tool_calls } as unknown as Record<string, unknown>)
              : {}),
          } as ChatMessage)

          // No tool calls → LLM finished without calling finish_analysis
          if (!response.tool_calls || response.tool_calls.length === 0) {
            finished = true
            break
          }

          const roundHasEmit = response.tool_calls.some((tc) => tc.function.name === 'emit_rule_suggestion')

          // Once the LLM has emitted suggestions and then starts a round with no
          // emits, it's going back to investigate — stop here.
          if (everEmitted && !roundHasEmit) break

          // Execute tool calls
          for (const tc of response.tool_calls) {
            const toolName = tc.function.name
            let args: unknown
            try {
              args = JSON.parse(tc.function.arguments)
            } catch {
              args = {}
            }

            // Hard cap on expensive investigation tools
            if (toolName === 'query_transactions' || toolName === 'search_transactions') {
              queryCount++
              if (queryCount > MAX_QUERIES) {
                messages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: 'Query limit reached. Please emit your suggestions now using emit_rule_suggestion, then call finish_analysis.',
                })
                continue
              }
            }

            send({ type: 'status', message: `→ ${toolName.replace(/_/g, ' ')}…` })

            let result: string
            try {
              result = await dispatchRulesTool(userId, toolName, args, ctx)
            } catch (e) {
              result = `Error: ${e instanceof Error ? e.message : String(e)}`
            }

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result,
            })

            if (toolName === 'emit_rule_suggestion') {
              emitCount++
              if (emitCount >= MAX_EMITS) { finished = true; break }
            }

            if (result === 'FINISH_ANALYSIS') {
              finished = true
              break
            }
          }

          if (finished) break
          if (roundHasEmit) everEmitted = true
        }

        // ── Step 4: done ──────────────────────────────────────────────────
        send({ type: 'done', uncategorised: uncatCount, noPayee: noPayeeCount })
        // Small delay so the done event flushes before the stream closes
        await new Promise((r) => setTimeout(r, 200))
      } catch (err) {
        console.error('[rules-agent] error:', err instanceof Error ? err.stack : err)
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

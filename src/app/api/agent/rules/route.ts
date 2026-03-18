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
import { dispatchTool } from '@/lib/agent/finance-tools'

// ── SSE helper ────────────────────────────────────────────────────────────────

function encode(event: RulesSseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert financial categorisation assistant. Your job is to analyse the user's transaction data and suggest high-quality automation rules.

All core data is pre-loaded in the user message (uncategorised transactions, categories, existing payees, no-payee transactions). Do NOT re-fetch this data.

Workflow:
1. Read the pre-loaded data carefully
2. Call record_plan ONCE with your strategy: which merchant/pattern groups you spotted, which categories they map to, which payees you will assign
3. Optionally use get_rules ONCE to check existing rule coverage and avoid duplicating them
4. Optionally use search_transactions or query_transactions (max 2 calls total) to investigate a specific ambiguous pattern
5. Emit all suggestions via emit_rule_suggestion (if a suggestion is rejected, read the rejection reason and resubmit with a fix)
6. Call finish_analysis

PAYEE ASSIGNMENT — CRITICAL:
- ALWAYS set payeeName on every suggestion where the merchant/counterparty is identifiable
- Use your world knowledge aggressively: "Wayfair", "Zalando", "Stripe", "Github", "Netflix", "Spotify", "Uber", "Amazon", "AWS", etc. are recognisable merchants — set them as payee even if not in the existing payees list
- If the transaction description or existing payeeName on the group clearly identifies the merchant, use it
- Only leave payeeName null if the counterparty is genuinely ambiguous (e.g. "Bank transfer ref 12345")
- Check the existing payees list — if the payee already exists there, use the exact same spelling

RULE QUALITY:
- categoryName must exactly match one of the provided category names (case-insensitive)
- Prefer description contains over payeeName equals for more robust matching
- 2+ matching transactions = high confidence; 1 = medium
- 1 sentence reasoning referencing the specific pattern observed
- Aim for 5–20 suggestions prioritised by financial impact (highest absolute spend first)
- When emit_rule_suggestion returns a rejection, READ the reason and immediately resubmit with the corrected suggestion — do NOT skip it`

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
        send({ type: 'status', message: 'Fetching transaction data…' })
        const [uncatData, catsData, noPayeeData, payeesData] = await Promise.all([
          dispatchRulesTool(userId, 'get_uncategorised_transactions', { topN: 25 }, ctx),
          dispatchRulesTool(userId, 'get_categories', {}, ctx),
          dispatchRulesTool(userId, 'get_no_payee_transactions', { topN: 20 }, ctx),
          dispatchTool(userId, 'get_payees', {}),
        ])

        // ── Step 3: single LLM round to emit suggestions ──────────────────
        send({ type: 'status', message: 'Ready — starting analysis…' })

        const userMessage = `${snapshot}

--- AVAILABLE CATEGORIES (use ONLY these exact names) ---
${catsData}

--- EXISTING PAYEES (reuse exact spelling if the merchant matches) ---
${payeesData}

--- UNCATEGORISED TRANSACTIONS (top 25 by spend) ---
${uncatData}

--- TRANSACTIONS WITH CATEGORY BUT NO PAYEE (assign payee rules) ---
${noPayeeData}

Instructions:
1. Call record_plan with your strategy (which merchants → which category from the list above)
2. Emit rule suggestions using emit_rule_suggestion — categoryName must be copied VERBATIM from the AVAILABLE CATEGORIES list above
3. For every suggestion where the merchant is identifiable (use world knowledge), set payeeName
4. If emit_rule_suggestion returns "Rejected", fix the issue described and resubmit
5. Call finish_analysis when done`

        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ]

        let finished = false
        let everEmitted = false  // true once any emit_rule_suggestion succeeds
        let emitCount = 0
        const MAX_EMITS = 20
        let queryCount = 0
        const MAX_QUERIES = 2  // hard cap on query_transactions / search_transactions calls
        let consecutiveRejections = 0
        const MAX_CONSECUTIVE_REJECTIONS = 5

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

            if (toolName === 'emit_rule_suggestion' && result.startsWith('Rejected')) {
              console.log(`[rules-agent] rejection:`, result, '| args:', JSON.stringify(args).slice(0, 200))
            }

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result,
            })

            if (toolName === 'emit_rule_suggestion') {
              // Only count successful emits (not rejections) toward the cap
              if (result.startsWith('Emitted:')) {
                emitCount++
                consecutiveRejections = 0
                if (emitCount >= MAX_EMITS) { finished = true; break }
              } else {
                consecutiveRejections++
                if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
                  console.log('[rules-agent] too many consecutive rejections, stopping')
                  finished = true
                  break
                }
              }
            }

            if (result === 'FINISH_ANALYSIS') {
              finished = true
              break
            }
          }

          if (finished) break
          // Only set everEmitted if at least one successful emit happened this round
          if (roundHasEmit && emitCount > 0) everEmitted = true
        }

        // ── Step 4: done ──────────────────────────────────────────────────
        console.log('[rules-agent] ── FULL CONVERSATION DUMP ──')
        for (const msg of messages) {
          const m = msg as unknown as Record<string, unknown>
          const role = m.role as string
          const tcs = m.tool_calls as { id: string; function: { name: string; arguments: string } }[] | undefined
          if (role === 'system') {
            console.log(`[${role}] (system prompt — ${String(m.content).length} chars)`)
          } else if (role === 'user' && !m.tool_call_id) {
            console.log(`[${role}] (initial user message — ${String(m.content).length} chars)`)
          } else if (role === 'tool') {
            console.log(`[tool result | id:${m.tool_call_id}] ${String(m.content).slice(0, 300)}`)
          } else if (tcs && tcs.length > 0) {
            for (const tc of tcs) {
              console.log(`[assistant → ${tc.function.name}] ${tc.function.arguments.slice(0, 300)}`)
            }
            if (m.content) console.log(`[assistant text] ${String(m.content).slice(0, 200)}`)
          } else {
            console.log(`[${role}] ${String(m.content).slice(0, 300)}`)
          }
        }
        console.log('[rules-agent] ── END DUMP ──')

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

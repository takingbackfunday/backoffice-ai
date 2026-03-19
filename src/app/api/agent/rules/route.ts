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

ALL data is pre-loaded in the user message. Do NOT call get_rules, get_categories, get_uncategorised_transactions, get_no_payee_transactions, or get_payees — the data is already there.

CRITICAL — CATEGORY NAMES:
- The user message contains an "AVAILABLE CATEGORIES" section. Read it FIRST before doing anything else.
- categoryName MUST be copied VERBATIM (exact spelling, exact capitalisation) from that list.
- Do NOT use generic names like "Housing", "Education", "Food", "Transport", "Transfers & other" unless those exact strings appear in the list.
- The taxonomy is user-specific — it may be IRS Schedule C, Schedule E, or personal finance categories. Only use what is in the list.
- If no category fits perfectly, pick the closest match from the list. Never invent a name.

Workflow:
1. Read the AVAILABLE CATEGORIES list carefully — write down the exact names you will use for each merchant group
2. Call record_plan ONCE: list every merchant group → exact category name from the list → payee
3. Emit ALL suggestions in a SINGLE round by calling emit_rule_suggestion multiple times in one response — do NOT spread them across multiple rounds
4. If any suggestion is rejected for a bad categoryName, look at the full list in the rejection message and resubmit with the correct name immediately
5. Call finish_analysis

PAYEE ASSIGNMENT — CRITICAL:
- ALWAYS set payeeName on every suggestion where the merchant/counterparty is identifiable
- Use your world knowledge aggressively: "Wayfair", "Zalando", "Stripe", "GitHub", "Netflix", "Spotify", "Uber", "Amazon", "AWS", "SUPER.COM", etc. are recognisable merchants — set them as payee even if not in the existing payees list
- If the transaction description or existing payeeName clearly identifies the merchant, use it
- Only leave payeeName null if the counterparty is genuinely ambiguous (e.g. "Bank transfer ref 12345")
- Check the EXISTING PAYEES list first — if the payee already exists there, use the exact same spelling

RULE CONDITIONS — CRITICAL:
- Valid fields: description, payeeName, amount, accountName. Do NOT use "date" — it is not a valid field and will be rejected.
- ALWAYS use description contains as the PRIMARY condition. It matches the raw transaction text and is the most reliable.
- payeeName equals is SECONDARY — only add it if there is already a payee in the EXISTING PAYEES list. Do not use it as the sole condition because payees may not exist yet.
- Never add a date condition. Rules are not time-bound.
- "all" means AND — every condition must match the SAME transaction. Do NOT put multiple description variants in "all" — a single transaction cannot contain "Zalando Payments" AND "Www Zalando De" at the same time.
- For multiple description variants (different spellings of the same merchant), use "any" (OR logic): { "any": [{ "field": "description", "operator": "contains", "value": "Zalando" }] } — or better, pick the ONE keyword that appears in all variants (e.g. "Zalando" matches all of them).
- Prefer ONE broad keyword over multiple narrow variants. Check the "descriptions" field to find the common substring.
- Matching is case-insensitive — never add two conditions that differ only by capitalisation (e.g. "Urban Sports GmbH" and "Urban Sports Gmbh" are identical). Use the lowercase version and move on.

RULE QUALITY:
- The "descriptions" field in the uncategorised data shows the actual raw transaction text — use it to pick the right keyword for a description contains condition
- 2+ matching transactions = high confidence; 1 or world-knowledge = medium
- 1 sentence reasoning referencing the specific pattern observed
- Aim for 5–20 suggestions prioritised by financial impact (highest absolute spend first)
- SKIP any merchant that appears in the EXISTING RULES list — a rule already covers it`

const MAX_TOOL_ROUNDS = 16

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
        const [uncatData, catsData, noPayeeData, payeesData, rulesData] = await Promise.all([
          dispatchRulesTool(userId, 'get_uncategorised_transactions', { topN: 40 }, ctx),
          dispatchRulesTool(userId, 'get_categories', {}, ctx),
          dispatchRulesTool(userId, 'get_no_payee_transactions', { topN: 30 }, ctx),
          dispatchTool(userId, 'get_payees', {}),
          dispatchRulesTool(userId, 'get_rules', {}, ctx),
        ])

        // ── Step 3: single LLM round to emit suggestions ──────────────────
        console.log('[rules-agent] context', JSON.stringify({
          categoriesLen: catsData.length,
          uncategorisedLen: uncatData.length,
          payeesLen: payeesData.length,
          rulesLen: rulesData.length,
          noPayeeLen: noPayeeData.length,
          // Log the first 800 chars of the categories list so we can see what the LLM has
          categoriesPreview: catsData.slice(0, 800),
          // Log the first 600 chars of uncategorised groups
          uncategorisedPreview: uncatData.slice(0, 600),
        }))

        send({ type: 'status', message: 'Ready — starting analysis…' })

        const userMessage = `${snapshot}

--- AVAILABLE CATEGORIES (copy names VERBATIM from this list) ---
${catsData}

--- EXISTING PAYEES (reuse exact spelling if the merchant matches) ---
${payeesData}

--- EXISTING RULES (SKIP merchants already covered here — do not suggest duplicate rules) ---
${rulesData}

--- UNCATEGORISED TRANSACTIONS NOT COVERED BY EXISTING RULES (top 40 by spend) ---
${uncatData}

--- TRANSACTIONS WITH CATEGORY BUT NO PAYEE (top 30) ---
${noPayeeData}

Instructions:
1. Call record_plan listing every merchant group you spotted → category → payee
2. Emit ALL suggestions in ONE response (call emit_rule_suggestion multiple times at once)
3. Use the "descriptions" field to pick the right keyword for each condition
4. If a suggestion is rejected, fix and resubmit immediately
5. Call finish_analysis`

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

        // Two-model strategy:
        // - Opus 4.6   → round 1 (record_plan only): deep reasoning on ambiguous merchants/categories
        // - Haiku 4.5  → rounds 2-N: fast bulk emission guided by the Opus plan
        // - Opus 4.6   → one final cleanup round if Haiku leaves unresolved rejections
        const STRATEGY_MODEL = 'anthropic/claude-opus-4-6'
        const EXECUTION_MODEL = 'anthropic/claude-haiku-4-5-20251001'

        const t0 = Date.now()
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          consecutiveRejections = 0  // reset per round — each new LLM response gets a fresh chance

          // Round 1: Opus reasons and plans. Escalation rounds (user message injected): Opus cleans up.
          // All other rounds: Haiku executes fast.
          const lastMsg = messages.at(-1)
          const isStrategyRound = round === 0 || (lastMsg?.role === 'user' && round > 0)
          const model = isStrategyRound ? STRATEGY_MODEL : EXECUTION_MODEL

          console.log('[rules-agent] round:start', JSON.stringify({ round: round + 1, model, messages: messages.length, emitCount, lastRole: messages.at(-1)?.role }))
          send({ type: 'status', message: round === 0 ? 'Opus reasoning…' : `Haiku emitting (round ${round + 1})…` })
          const response = await openrouterWithTools(messages, RULES_TOOLS, model)

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

          // Execute tool calls — collect outcomes for round summary log
          type RoundOutcome = { tool: string; status: string; detail: string }
          const roundOutcomes: RoundOutcome[] = []

          for (const tc of response.tool_calls) {
            const toolName = tc.function.name
            let args: unknown
            try {
              args = JSON.parse(tc.function.arguments)
            } catch {
              args = {}
            }

            // Block pre-loaded tools — data is already in the user message
            const PRELOADED = ['get_rules', 'get_categories', 'get_uncategorised_transactions', 'get_no_payee_transactions', 'get_payees']
            if (PRELOADED.includes(toolName)) {
              const msg = `This data is already pre-loaded in the user message above. Do not call ${toolName} again — use the data already provided and emit your suggestions.`
              messages.push({ role: 'tool', tool_call_id: tc.id, content: msg })
              roundOutcomes.push({ tool: toolName, status: 'blocked:preloaded', detail: '' })
              continue
            }

            // Hard cap on expensive investigation tools
            if (toolName === 'query_transactions' || toolName === 'search_transactions') {
              queryCount++
              if (queryCount > MAX_QUERIES) {
                messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Query limit reached. Emit your suggestions now using emit_rule_suggestion, then call finish_analysis.' })
                roundOutcomes.push({ tool: toolName, status: 'blocked:query-limit', detail: '' })
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

            messages.push({ role: 'tool', tool_call_id: tc.id, content: result })

            if (toolName === 'emit_rule_suggestion') {
              const a = args as Record<string, unknown>
              const conditions = (a.conditions as Record<string, unknown[]>)
              const allConds = (conditions?.all ?? conditions?.any ?? []) as Record<string, string>[]
              const condStr = allConds.map(c => `${c.field}:${c.operator}:"${String(c.value).slice(0, 40)}"`).join(' AND ')
              if (result.startsWith('Emitted:')) {
                emitCount++
                consecutiveRejections = 0
                roundOutcomes.push({ tool: 'emit', status: '✓', detail: `[${a.categoryName}] ${condStr} → payee:${a.payeeName ?? 'null'} (${result})` })
                if (emitCount >= MAX_EMITS) { finished = true; break }
              } else {
                consecutiveRejections++
                roundOutcomes.push({ tool: 'emit', status: '✗', detail: `[${a.categoryName}] ${condStr} → ${result.slice(0, 120)}` })
                if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
                  console.log('[rules-agent] stopping: too many consecutive rejections', JSON.stringify({ consecutiveRejections, emitCount }))
                  finished = true
                  break
                }
              }
            } else if (toolName === 'record_plan') {
              roundOutcomes.push({ tool: 'record_plan', status: 'ok', detail: '' })
            } else if (toolName === 'finish_analysis') {
              roundOutcomes.push({ tool: 'finish_analysis', status: 'ok', detail: '' })
            } else {
              // query_transactions, search_transactions, etc. — log result preview
              roundOutcomes.push({ tool: toolName, status: 'ok', detail: result.slice(0, 200) })
            }

            if (result === 'FINISH_ANALYSIS') {
              finished = true
              break
            }
          }

          // Print full round summary — one log line per outcome
          const accepted = roundOutcomes.filter(o => o.status === '✓').length
          const rejected = roundOutcomes.filter(o => o.status === '✗').length
          console.log(`[rules-agent] round:${round + 1} summary — ${accepted} accepted, ${rejected} rejected, ${roundOutcomes.length} total calls`)
          for (const o of roundOutcomes) {
            console.log(`  [${o.status}] ${o.tool}${o.detail ? ': ' + o.detail : ''}`)
          }

          if (finished) break
          // Only set everEmitted if at least one successful emit happened this round
          if (roundHasEmit && emitCount > 0) everEmitted = true

          // If Haiku finished emitting but left rejections, inject an Opus cleanup prompt
          if (everEmitted && rejected > 0 && !roundOutcomes.some(o => o.tool === 'finish_analysis')) {
            const rejectedSummary = roundOutcomes
              .filter(o => o.status === '✗')
              .map(o => o.detail)
              .join('\n')
            messages.push({
              role: 'user',
              content: `Some suggestions were rejected. Please resolve each one using the exact category names from the AVAILABLE CATEGORIES list, correct conditions, and call finish_analysis when done.\n\nRejected:\n${rejectedSummary}`,
            })
            console.log('[rules-agent] escalating to Opus for cleanup', JSON.stringify({ rejected, emitCount }))
            send({ type: 'status', message: 'Opus resolving rejections…' })
          }
        }

        // ── Step 4: done ──────────────────────────────────────────────────
        console.log('[rules-agent] done', JSON.stringify({ emitCount, messages: messages.length, totalMs: Date.now() - t0 }))

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

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { parsePreferences } from '@/types/preferences'
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

const SYSTEM_PROMPT = `You are an expert financial categorisation assistant. Your job is to analyse the user's transaction data and suggest high-quality automation rules.

CRITICAL — CATEGORY NAMES:
- Call get_categories FIRST. Read that list before doing anything else.
- categoryName MUST be copied VERBATIM (exact spelling, exact capitalisation) from that list.
- Do NOT use generic names like "Housing", "Education", "Food", "Transport", "Transfers & other" unless those exact strings appear in the list.
- The taxonomy is user-specific — it may be IRS Schedule C, Schedule E, or personal finance categories. Only use what is in the list.
- If no category fits perfectly, pick the closest match from the list. Never invent a name.

Workflow:
1. Call get_categories, get_uncategorised_transactions, get_no_payee_transactions, get_rules, get_ruleless_patterns, get_project_transactions, get_transfer_candidates, and get_payees in a SINGLE response (call them all at once)
2. Call record_plan — list your TOP 20 merchant groups in ONE LINE EACH: "merchant → category (payee: PayeeName) [project: ProjectName]" or "merchant → SKIP (reason)". Only include [project: X] when the pattern clearly belongs to one project. Do NOT add explanatory notes, transaction counts, or reasoning — just the one-line mapping per merchant. The execution model copies payee and project names directly from this plan, so spell them correctly. Do NOT call query_transactions before record_plan.
3. Emit ALL suggestions in a SINGLE round by calling emit_rule_suggestion multiple times in one response — do NOT spread them across multiple rounds
4. If any suggestion is rejected for a bad categoryName or workspaceName, look at the full list in the rejection message and resubmit with the correct name immediately
5. Call finish_analysis

SOURCES OF PATTERNS — SELF-LEARNING:
Use tools to fetch FIVE sources of patterns. Treat all five equally:
1. get_uncategorised_transactions — no category yet; suggest a category + payee rule using description contains
2. get_no_payee_transactions — already categorised; suggest a rule that assigns the missing payee. Use description contains as the primary condition. Copy categoryName VERBATIM from the "category:" field shown for that group — do NOT guess or substitute a different name. The rule formalises the existing label and assigns the payee; it must fire on fresh imports that arrive without a payee.
3. get_ruleless_patterns — the user manually tagged these; formalise them as rules. Use description contains as the primary condition, NOT payeeName equals — even when a payee is shown, the rule must fire on raw transactions that don't yet have a payee assigned. Copy both categoryName and payeeName VERBATIM from the "category:" and "payee:" fields in the data.
4. get_project_transactions — the user assigned these to a project; create rules so future similar transactions are auto-assigned. Set workspaceName from the "project" field shown
5. get_transfer_candidates — same-day debit/credit pairs across different accounts whose amounts match closely. These are almost certainly internal fund movements (bank transfer, moving money between accounts). Suggest a rule with category "Account transfer" (or the closest match in the AVAILABLE CATEGORIES list) for the description keywords found on each side. Transfer rules are HIGH priority — they prevent fund movements from inflating spending or income reports. Use description contains with the common keyword from the debit or credit side.

PAYEE ASSIGNMENT — CRITICAL:
- ALWAYS set payeeName on every suggestion where the merchant/counterparty is identifiable — this means nearly every suggestion should have a payee
- The merchant name from the description IS the payee: "The Lobster Pot" → payee "The Lobster Pot". "FALCO SLICE" → payee "Falco Slice". "LS Wen Cheng IV" → payee "LS Wen Cheng IV". You do NOT need global brand recognition — any named restaurant, shop, service, or venue has an identifiable name that should be used as the payee
- Use your world knowledge for well-known brands: "Wayfair", "Zalando", "Stripe", "GitHub", "Netflix", "Spotify", "Uber", "Amazon", "AWS", "PIKAPODS", "FlixBus", "Railcard", etc. — use the canonical brand name (e.g. "FlixBus" not "FLIXBUS.COM")
- If the transaction description or existing payeeName clearly identifies any named business, use that name as the payee
- Only leave payeeName null if the counterparty is genuinely ambiguous (e.g. "Bank transfer ref 12345", "OZAN OZYUKSEL" when it could be a personal transfer with no consistent payee name)
- Check the EXISTING PAYEES list first — if the payee already exists there, use the exact same spelling
- When executing suggestions, copy the payee name EXACTLY from the record_plan output. If the plan says "payee: Sharenow", set payeeName to "Sharenow". Do not drop payees that were identified in the plan.

PROJECT ASSIGNMENT:
- workspaceName MUST be copied VERBATIM from the AVAILABLE PROJECTS list — do not invent or abbreviate
- Only set workspaceName when the pattern unambiguously belongs to one project (e.g. all transactions with "Acme Ltd" in the description go to the Acme project)
- Do NOT set workspaceName for generic merchants (e.g. "Starbucks" → no project; "Acme Ltd Payment" → project "Acme Ltd" if that project exists)
- Leave workspaceName null when you are not confident

RULE CONDITIONS — CRITICAL:
- Valid fields: description, payeeName, amount, accountName. Do NOT use "date" — it is not a valid field and will be rejected.
- ALWAYS use description contains as the PRIMARY condition. It matches the raw transaction text and is the most reliable.
- payeeName equals is SECONDARY — only add it if there is already a payee in the EXISTING PAYEES list. Do not use it as the sole condition because payees may not exist yet.
- NEVER use "payeeName equals X" as the condition when you are also setting payeeName to X in the action — that is a no-op (the rule only matches transactions that already have payee X, so setting it again does nothing). Always use "description contains" as the primary condition so the rule fires on raw transactions before a payee is assigned.
- More broadly, NEVER use payeeName as the SOLE non-amount condition — a rule whose only meaningful condition is payeeName only fires on transactions that already have that payee set and will never catch new bank imports. Always anchor on description contains; payeeName equals is only useful as a secondary narrowing condition when the payee already exists.
- Never add a date condition. Rules are not time-bound.
- "all" means AND — every condition must match the SAME transaction. Do NOT put multiple description variants in "all" — a single transaction cannot contain "Zalando Payments" AND "Www Zalando De" at the same time.
- For multiple description variants (different spellings of the same merchant), use "any" (OR logic): { "any": [{ "field": "description", "operator": "contains", "value": "Zalando" }] } — or better, pick the ONE keyword that appears in all variants (e.g. "Zalando" matches all of them).
- Prefer ONE broad keyword over multiple narrow variants. Check the "descriptions" field to find the common substring.
- Matching is case-insensitive — never add two conditions that differ only by capitalisation (e.g. "Urban Sports GmbH" and "Urban Sports Gmbh" are identical). Use the lowercase version and move on.
- NEVER use payment processor names as keywords: Adyen, Stripe, PayPal, Square, SumUp, Mollie, Klarna, Mangopay, Braintree. These appear in descriptions as the payment rail ("Urban Sports Gmbh by Adyen") — the keyword must be the actual merchant name, not the processor.

RULE QUALITY:
- The "descriptions" field in the data shows the actual raw transaction text — use it to pick the right keyword for a description contains condition
- 2+ matching transactions = high confidence; 1 or world-knowledge = medium
- 1 sentence reasoning referencing the specific pattern observed
- Aim for 5–20 suggestions prioritised by transaction count and financial impact, ordered across ALL sources — do not cluster all suggestions of one type before moving to the next source
- SKIP any merchant that appears in the EXISTING RULES list — a rule already covers it
- For ALREADY-LABELLED PATTERNS, the "category" and "payee" fields tell you what the user already set — use exactly those values

TRANSACTION ANALYSIS — LOOK AT INDIVIDUAL AMOUNTS:
- Each description now shows its individual amount in parentheses. ALWAYS examine these before suggesting a rule for a group.
- Round amounts (−50.00, −100.00, −200.00, −500.00) at convenience stores, gas stations, kiosks, or supermarkets almost always indicate ATM cash withdrawals, NOT purchases at that merchant. Do NOT categorise these as groceries, fuel, etc. — skip the group or flag it as "Cash withdrawal" if that category exists.
- When a group mixes round amounts and small irregular amounts (e.g. "Spaetkauf (−100.00) | Spaetkauf (−200.00) | Spaetkauf Friesen (−12.00)"), the round amounts are likely ATM withdrawals and only the small amounts are actual purchases. Consider whether a single rule for the whole group is appropriate — it may be better to skip the group entirely or add an amount condition to exclude round withdrawals.
- Numeric prefixes in descriptions (e.g. "49005007 Spaetkauf") are typically ATM terminal or POS terminal IDs — the merchant name follows.
- Amounts that are exact multiples of 10 or 50 with no cents at a physical retail location are a strong signal of cash withdrawal, not a purchase.`

const MAX_TOOL_ROUNDS = 16

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Rate limit: one analysis per user per 30 seconds
  const COOLDOWN_MS = 30_000
  const pref = await prisma.userPreference.findUnique({ where: { userId } })
  const lastRun = parsePreferences(pref?.data).lastRulesAgentRun
  if (lastRun && Date.now() - lastRun < COOLDOWN_MS) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', error: 'Please wait 30 seconds between analyses.' })}\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }
  // Update last run timestamp
  await prisma.userPreference.upsert({
    where: { userId },
    update: { data: { ...parsePreferences(pref?.data), lastRulesAgentRun: Date.now() } as never },
    create: { userId, data: { lastRulesAgentRun: Date.now() } },
  })

  const stream = new ReadableStream({
    async start(controller) {
      const runId = Math.random().toString(36).slice(2, 10)

      function send(event: RulesSseEvent) {
        controller.enqueue(encode(event))
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'))
      }, 5000)

      // Hard timeout — close the stream gracefully if analysis runs too long
      const HARD_TIMEOUT_MS = 55_000
      let hardTimedOut = false
      // emitCount is declared here (before try) so the timeout callback can read it
      let emitCount = 0
      const hardTimeout = setTimeout(() => {
        hardTimedOut = true
        console.log(`[rules-agent:${runId}] hard timeout reached — closing stream gracefully`)
        // Message depends on whether any suggestions arrived before the timeout
        const timeoutMsg = emitCount > 0
          ? `Analysis timed out after ${Math.round(HARD_TIMEOUT_MS / 1000)}s — ${emitCount} suggestion${emitCount === 1 ? '' : 's'} found so far. Try running again for more.`
          : `Analysis timed out after ${Math.round(HARD_TIMEOUT_MS / 1000)}s — the AI model took too long to respond. Please try again.`
        send({ type: 'error', error: timeoutMsg })
      }, HARD_TIMEOUT_MS)

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

        // ── Step 2: load validation context (needed for emit_rule_suggestion) ──
        send({ type: 'status', message: 'Loading rules context…' })

        const preloaded = await loadRulesContext(userId)

        const ctx: RulesContext = {
          send,
          ...preloaded,
          coveredThisRun: new Set<string>(),
        }

        // ── Step 3: start LLM — it will call tools lazily ─────────────────
        console.log(`[rules-agent:${runId}] context loaded`, JSON.stringify({
          categoryCount: preloaded.categoryMap.size,
          workspaceCount: preloaded.workspaceMap.size,
        }))

        send({ type: 'status', message: 'Ready — starting analysis…' })

        const userMessage = snapshot

        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ]

        let finished = false
        let everEmitted = false  // true once any emit_rule_suggestion succeeds
        // emitCount declared before try block (needed by hard timeout callback)
        const MAX_EMITS = 20
        let queryCount = 0
        const MAX_QUERIES = 2  // hard cap on query_transactions / search_transactions calls
        let consecutiveRejections = 0
        const MAX_CONSECUTIVE_REJECTIONS = 5
        let totalRejections = 0
        const MAX_TOTAL_REJECTIONS = 12

        // Two-model strategy:
        // - Sonnet 4.6 → rounds 0 & 1: fetch all data (round 0), then record_plan (round 1)
        // - Haiku 4.5  → rounds 2-N: fast bulk emission guided by the Sonnet plan
        // - Sonnet 4.6 → one final cleanup round if Haiku leaves unresolved rejections (user msg injected)
        const STRATEGY_MODEL = 'anthropic/claude-sonnet-4.6'
        const EXECUTION_MODEL = 'anthropic/claude-haiku-4.5'

        const t0 = Date.now()
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (hardTimedOut) break

          // Rounds 0-1: Sonnet fetches data and plans. Escalation rounds (user message injected): Sonnet cleans up.
          // Round 2+: Haiku executes fast.
          const lastMsg = messages.at(-1)
          const isStrategyRound = round <= 1 || (lastMsg?.role === 'user' && round > 0)
          const model = isStrategyRound ? STRATEGY_MODEL : EXECUTION_MODEL

          console.log(`[rules-agent:${runId}] round:start`, JSON.stringify({ round: round + 1, model, messages: messages.length, emitCount, lastRole: messages.at(-1)?.role }))
          send({ type: 'status', message: round === 0 ? 'Fetching data…' : round === 1 ? 'Sonnet planning…' : `Haiku emitting (round ${round + 1})…` })
          const response = await openrouterWithTools(messages, RULES_TOOLS, model)

          // Push assistant message — omit content when null/empty alongside tool_calls
          const assistantMsg: Record<string, unknown> = { role: 'assistant' }
          if (response.content) assistantMsg.content = response.content
          if (response.tool_calls) assistantMsg.tool_calls = response.tool_calls
          if (!assistantMsg.content && !assistantMsg.tool_calls) assistantMsg.content = ''
          messages.push(assistantMsg as unknown as ChatMessage)

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
          const roundHasRecordPlan = response.tool_calls.some(tc => tc.function.name === 'record_plan')

          for (const tc of response.tool_calls) {
            const toolName = tc.function.name
            let args: unknown
            try {
              args = JSON.parse(tc.function.arguments)
            } catch {
              args = {}
            }

            // Rounds 1+: block queries before record_plan — model must plan before investigating
            if (round >= 1 && !roundHasRecordPlan && !everEmitted && (toolName === 'query_transactions' || toolName === 'search_transactions')) {
              messages.push({ role: 'tool', tool_call_id: tc.id, content: 'You must call record_plan FIRST before querying transactions. Call record_plan now with your analysis plan, then you may query for additional detail.' })
              roundOutcomes.push({ tool: toolName, status: 'blocked:no-plan-yet', detail: '' })
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
                if (emitCount >= MAX_EMITS) {
                  const remainingCalls = response.tool_calls!.slice(response.tool_calls!.indexOf(tc) + 1)
                  const droppedEmits = remainingCalls.filter(c => c.function.name === 'emit_rule_suggestion').length
                  if (droppedEmits > 0) {
                    console.log(`[rules-agent:${runId}] MAX_EMITS reached — dropping ${droppedEmits} remaining emit call(s)`)
                  }
                  finished = true
                  break
                }
              } else {
                consecutiveRejections++
                totalRejections++
                roundOutcomes.push({ tool: 'emit', status: '✗', detail: `[${a.categoryName}] ${condStr} → ${result.slice(0, 120)}` })
                if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
                  console.log(`[rules-agent:${runId}] stopping: too many consecutive rejections`, JSON.stringify({ consecutiveRejections, emitCount }))
                  finished = true
                  break
                }
                if (totalRejections >= MAX_TOTAL_REJECTIONS) {
                  console.log(`[rules-agent:${runId}] stopping: too many total rejections`, JSON.stringify({ totalRejections, emitCount }))
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
          console.log(`[rules-agent:${runId}] round:${round + 1} summary — ${accepted} accepted, ${rejected} rejected, ${roundOutcomes.length} total calls`)
          for (const o of roundOutcomes) {
            console.log(`  [${o.status}] ${o.tool}${o.detail ? ': ' + o.detail : ''}`)
          }

          if (finished) break
          // Only set everEmitted if at least one successful emit happened this round
          if (roundHasEmit && emitCount > 0) everEmitted = true

          // If Haiku finished emitting but left 2+ consecutive rejections, inject a Sonnet cleanup prompt
          if (everEmitted && consecutiveRejections >= 2 && !roundOutcomes.some(o => o.tool === 'finish_analysis')) {
            const rejectedSummary = roundOutcomes
              .filter(o => o.status === '✗')
              .map(o => o.detail)
              .join('\n')
            messages.push({
              role: 'user',
              content: `Some suggestions were rejected. Please resolve each one using the exact category names from the AVAILABLE CATEGORIES list, correct conditions, and call finish_analysis when done.\n\nRejected:\n${rejectedSummary}`,
            })
            console.log(`[rules-agent:${runId}] escalating to Sonnet for cleanup`, JSON.stringify({ consecutiveRejections, emitCount }))
            send({ type: 'status', message: 'Sonnet resolving rejections…' })
          }
        }

        // ── Step 4: done ──────────────────────────────────────────────────
        console.log(`[rules-agent:${runId}] done`, JSON.stringify({ emitCount, messages: messages.length, totalMs: Date.now() - t0 }))

        send({ type: 'done', uncategorised: uncatCount, noPayee: noPayeeCount })
        // Small delay so the done event flushes before the stream closes
        await new Promise((r) => setTimeout(r, 200))
      } catch (err) {
        console.error(`[rules-agent:${runId}] error:`, err instanceof Error ? err.stack : err)
        send({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        clearTimeout(hardTimeout)
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

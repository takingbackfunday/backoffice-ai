/**
 * Seed categorization rules for gmasproperties@outlook.com using the real rules agent.
 *
 * Run with:
 *   GMAS_USER_ID=user_3BijUlphbynJ8JSjCE478qt9uBy \
 *   OPENROUTER_API_KEY="..." \
 *   DIRECT_URL="<neon-direct-url>" \
 *   npx tsx prisma/seed-rules-gmas.ts
 *
 * How it works:
 *   - Uses the exact same LLM loop, system prompt, tools, and validation as the
 *     real rules agent route (GET /api/agent/rules).
 *   - The only difference: all transactions are passed as sourceEditIds so the
 *     40%-reclassification guard is bypassed (Pop's data is already categorised —
 *     we want rules for FUTURE imports, not based on uncategorised volume).
 *   - Accepted suggestions are written directly as CategorizationRule rows.
 */

import { openrouterWithTools, type ChatMessage } from '../src/lib/llm/openrouter'
import {
  RULES_TOOLS,
  dispatchRulesTool,
  loadRulesContext,
  type RulesContext,
  type RulesSseEvent,
} from '../src/lib/agent/rules-tools'
import { dispatchTool } from '../src/lib/agent/finance-tools'
import { prisma } from '../src/lib/prisma'

const userId = process.env.GMAS_USER_ID!
if (!userId) { console.error('GMAS_USER_ID not set'); process.exit(1) }

// ── Reuse the exact system prompt from the route ──────────────────────────────

const SYSTEM_PROMPT = `You are an expert financial categorisation assistant. Your job is to analyse the user's transaction data and suggest high-quality automation rules.

ALL data is pre-loaded in the user message. Do NOT call get_rules, get_categories, get_uncategorised_transactions, get_no_payee_transactions, or get_payees — the data is already there.

CRITICAL — CATEGORY NAMES:
- The user message contains an "AVAILABLE CATEGORIES" section. Read it FIRST before doing anything else.
- categoryName MUST be copied VERBATIM (exact spelling, exact capitalisation) from that list.
- Do NOT use generic names like "Housing", "Education", "Food", "Transport", "Transfers & other" unless those exact strings appear in the list.
- The taxonomy is user-specific — it may be IRS Schedule C, Schedule E, or personal finance categories. Only use what is in the list.
- If no category fits perfectly, pick the closest match from the list. Never invent a name.

Workflow:
1. Read the AVAILABLE CATEGORIES list carefully — identify the exact category name for each merchant group
2. Call record_plan FIRST — before any other tool. List your TOP 20 merchant groups in ONE LINE EACH: "merchant → category (payee: PayeeName)" or "merchant → SKIP (reason)". Do NOT add explanatory notes, transaction counts, or reasoning — just the one-line mapping per merchant. The execution model copies payee names directly from this plan, so spell them correctly. Do NOT call query_transactions before record_plan.
3. Emit ALL suggestions in a SINGLE round by calling emit_rule_suggestion multiple times in one response — do NOT spread them across multiple rounds
4. If any suggestion is rejected for a bad categoryName, look at the full list in the rejection message and resubmit with the correct name immediately
5. Call finish_analysis

PAYEE ASSIGNMENT — CRITICAL:
- ALWAYS set payeeName on every suggestion where the merchant/counterparty is identifiable — this means nearly every suggestion should have a payee
- The merchant name from the description IS the payee: "The Lobster Pot" → payee "The Lobster Pot". "FALCO SLICE" → payee "Falco Slice". "LS Wen Cheng IV" → payee "LS Wen Cheng IV". You do NOT need global brand recognition — any named restaurant, shop, service, or venue has an identifiable name that should be used as the payee
- Use your world knowledge for well-known brands: "Wayfair", "Zalando", "Stripe", "GitHub", "Netflix", "Spotify", "Uber", "Amazon", "AWS", "PIKAPODS", "FlixBus", "Railcard", etc. — use the canonical brand name (e.g. "FlixBus" not "FLIXBUS.COM")
- If the transaction description or existing payeeName clearly identifies any named business, use that name as the payee
- Only leave payeeName null if the counterparty is genuinely ambiguous (e.g. "Bank transfer ref 12345", "OZAN OZYUKSEL" when it could be a personal transfer with no consistent payee name)
- Check the EXISTING PAYEES list first — if the payee already exists there, use the exact same spelling
- When executing suggestions, copy the payee name EXACTLY from the record_plan output. If the plan says "payee: Sharenow", set payeeName to "Sharenow". Do not drop payees that were identified in the plan.

RULE CONDITIONS — CRITICAL:
- Valid fields: description, payeeName, amount, accountName. Do NOT use "date" — it is not a valid field and will be rejected.
- ALWAYS use description contains as the PRIMARY condition. It matches the raw transaction text and is the most reliable.
- payeeName equals is SECONDARY — only add it if there is already a payee in the EXISTING PAYEES list. Do not use it as the sole condition because payees may not exist yet.
- NEVER use "payeeName equals X" as the condition when you are also setting payeeName to X in the action — that is a no-op (the rule only matches transactions that already have payee X, so setting it again does nothing). Always use "description contains" as the primary condition so the rule fires on raw transactions before a payee is assigned.
- Never add a date condition. Rules are not time-bound.
- "all" means AND — every condition must match the SAME transaction. Do NOT put multiple description variants in "all" — a single transaction cannot contain "Zalando Payments" AND "Www Zalando De" at the same time.
- For multiple description variants (different spellings of the same merchant), use "any" (OR logic): { "any": [{ "field": "description", "operator": "contains", "value": "Zalando" }] } — or better, pick the ONE keyword that appears in all variants (e.g. "Zalando" matches all of them).
- Prefer ONE broad keyword over multiple narrow variants. Check the "descriptions" field to find the common substring.
- Matching is case-insensitive — never add two conditions that differ only by capitalisation (e.g. "Urban Sports GmbH" and "Urban Sports Gmbh" are identical). Use the lowercase version and move on.
- NEVER use payment processor names as keywords: Adyen, Stripe, PayPal, Square, SumUp, Mollie, Klarna, Mangopay, Braintree. These appear in descriptions as the payment rail ("Urban Sports Gmbh by Adyen") — the keyword must be the actual merchant name, not the processor.

RULE QUALITY:
- The "descriptions" field in the uncategorised data shows the actual raw transaction text — use it to pick the right keyword for a description contains condition
- 2+ matching transactions = high confidence; 1 or world-knowledge = medium
- 1 sentence reasoning referencing the specific pattern observed
- Aim for 5–20 suggestions prioritised by financial impact (highest absolute spend first)
- SKIP any merchant that appears in the EXISTING RULES list — a rule already covers it

TRANSACTION ANALYSIS — LOOK AT INDIVIDUAL AMOUNTS:
- Each description now shows its individual amount in parentheses. ALWAYS examine these before suggesting a rule for a group.
- Round amounts (−50.00, −100.00, −200.00, −500.00) at convenience stores, gas stations, kiosks, or supermarkets almost always indicate ATM cash withdrawals, NOT purchases at that merchant. Do NOT categorise these as groceries, fuel, etc. — skip the group or flag it as "Cash withdrawal" if that category exists.
- When a group mixes round amounts and small irregular amounts (e.g. "Spaetkauf (−100.00) | Spaetkauf (−200.00) | Spaetkauf Friesen (−12.00)"), the round amounts are likely ATM withdrawals and only the small amounts are actual purchases. Consider whether a single rule for the whole group is appropriate — it may be better to skip the group entirely or add an amount condition to exclude round withdrawals.
- Numeric prefixes in descriptions (e.g. "49005007 Spaetkauf") are typically ATM terminal or POS terminal IDs — the merchant name follows.
- Amounts that are exact multiples of 10 or 50 with no cents at a physical retail location are a strong signal of cash withdrawal, not a purchase.`

const MAX_TOOL_ROUNDS = 16

async function main() {
  console.log(`\n🤖  Seeding rules for userId: ${userId}\n`)

  // ── Load context ─────────────────────────────────────────────────────────────
  console.log('Loading rules context…')
  const preloaded = await loadRulesContext(userId)

  // KEY DIFFERENCE: mark ALL transactions as sourceEditIds so the 40%
  // reclassification guard doesn't block rules on already-categorised data.
  const sourceEditIds = new Set(preloaded.transactions.map(t => t.id))

  const accepted: Array<{
    conditions: Record<string, unknown>
    categoryName: string
    categoryId: string
    payeeName: string | null
    payeeId: string | null
    confidence: string
    reasoning: string
  }> = []

  const send = (event: RulesSseEvent) => {
    if (event.type === 'status') console.log(' >', event.message)
    if (event.type === 'suggestion' && event.rule) {
      console.log(`  ✓ Rule: "${event.rule.categoryName}" | payee: ${event.rule.payeeName ?? '—'} | matched: ${event.matchCount}`)
      accepted.push({
        conditions: event.rule.conditions as Record<string, unknown>,
        categoryName: event.rule.categoryName,
        categoryId: event.rule.categoryId!,
        payeeName: event.rule.payeeName,
        payeeId: event.rule.payeeId,
        confidence: event.rule.confidence,
        reasoning: event.rule.reasoning,
      })
    }
    if (event.type === 'error') console.error('  ✗ Error:', event.error)
  }

  const ctx: RulesContext = {
    send,
    ...preloaded,
    coveredThisRun: new Set(),
    sourceEditIds,
  }

  // ── Pre-fetch prompt data ────────────────────────────────────────────────────
  console.log('Fetching prompt data…')
  const [uncatData, catsData, noPayeeData, payeesData, rulesData] = await Promise.all([
    dispatchRulesTool(userId, 'get_uncategorised_transactions', { topN: 25 }, ctx),
    dispatchRulesTool(userId, 'get_categories', {}, ctx),
    dispatchRulesTool(userId, 'get_no_payee_transactions', { topN: 15 }, ctx),
    dispatchTool(userId, 'get_payees', {}),
    dispatchRulesTool(userId, 'get_rules', {}, ctx),
  ])

  const recentCutoff = new Date()
  recentCutoff.setMonth(recentCutoff.getMonth() - 18)
  const txCount = preloaded.transactions.length
  const uncatCount = preloaded.transactions.filter(t => !t.categoryId).length
  const noPayeeCount = preloaded.transactions.filter(t => t.categoryId && !t.payeeName).length

  const snapshot = `Financial database snapshot:
- Total transactions: ${txCount}
- Uncategorised transactions: ${uncatCount}
- Transactions with category but no payee: ${noPayeeCount}
- Active categorisation rules: 0 (this is a fresh migration — all data is already categorised from import)

NOTE: All transactions were imported with categories already set. The goal is to create rules that will correctly categorise FUTURE transactions as they are imported. Base rules on the patterns visible in the existing data.`

  const userMessage = `${snapshot}

--- AVAILABLE CATEGORIES (copy names VERBATIM from this list) ---
${catsData}

--- EXISTING PAYEES (reuse exact spelling if the merchant matches) ---
${payeesData}

--- EXISTING RULES (SKIP merchants already covered here — do not suggest duplicate rules) ---
${rulesData}

--- UNCATEGORISED TRANSACTIONS NOT COVERED BY EXISTING RULES (top 25 by spend) ---
${uncatData}

--- TRANSACTIONS WITH CATEGORY BUT NO PAYEE (top 15) ---
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

  // ── LLM tool loop ────────────────────────────────────────────────────────────
  const STRATEGY_MODEL = 'anthropic/claude-sonnet-4.6'
  const EXECUTION_MODEL = 'anthropic/claude-haiku-4.5'

  let finished = false
  let everEmitted = false
  let emitCount = 0
  const MAX_EMITS = 20
  let queryCount = 0
  const MAX_QUERIES = 2
  let consecutiveRejections = 0
  const MAX_CONSECUTIVE_REJECTIONS = 5
  let totalRejections = 0
  const MAX_TOTAL_REJECTIONS = 12

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const lastMsg = messages.at(-1)
    const isStrategyRound = round === 0 || (lastMsg?.role === 'user' && round > 0)
    const model = isStrategyRound ? STRATEGY_MODEL : EXECUTION_MODEL

    console.log(`\n[round ${round + 1}] model: ${model.split('/')[1]}`)
    const response = await openrouterWithTools(messages, RULES_TOOLS, model)

    messages.push({
      role: 'assistant',
      content: response.content ?? '',
      ...(response.tool_calls ? ({ tool_calls: response.tool_calls } as unknown as Record<string, unknown>) : {}),
    } as ChatMessage)

    if (!response.tool_calls || response.tool_calls.length === 0) {
      finished = true
      break
    }

    const roundHasEmit = response.tool_calls.some(tc => tc.function.name === 'emit_rule_suggestion')
    if (everEmitted && !roundHasEmit) break

    const roundHasRecordPlan = response.tool_calls.some(tc => tc.function.name === 'record_plan')
    const PRELOADED = ['get_rules', 'get_categories', 'get_uncategorised_transactions', 'get_no_payee_transactions', 'get_payees']

    for (const tc of response.tool_calls) {
      const toolName = tc.function.name
      let args: unknown
      try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

      if (round === 0 && !roundHasRecordPlan && (toolName === 'query_transactions' || toolName === 'search_transactions')) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'You must call record_plan FIRST before querying transactions.' })
        continue
      }
      if (PRELOADED.includes(toolName)) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: `This data is already pre-loaded. Do not call ${toolName} again.` })
        continue
      }
      if ((toolName === 'query_transactions' || toolName === 'search_transactions') && ++queryCount > MAX_QUERIES) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Query limit reached. Emit suggestions now then call finish_analysis.' })
        continue
      }

      let result: string
      try {
        result = await dispatchRulesTool(userId, toolName, args, ctx)
      } catch (e) {
        result = `Error: ${e instanceof Error ? e.message : String(e)}`
      }

      messages.push({ role: 'tool', tool_call_id: tc.id, content: result })

      if (toolName === 'emit_rule_suggestion') {
        if (result.startsWith('Emitted:')) {
          emitCount++
          consecutiveRejections = 0
          if (emitCount >= MAX_EMITS) { finished = true; break }
        } else {
          consecutiveRejections++
          totalRejections++
          console.log(`  ✗ Rejected: ${result.slice(0, 120)}`)
          if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS || totalRejections >= MAX_TOTAL_REJECTIONS) {
            finished = true; break
          }
        }
      }

      if (result === 'FINISH_ANALYSIS') { finished = true; break }
    }

    if (finished) break
    if (roundHasEmit && emitCount > 0) everEmitted = true

    if (everEmitted && consecutiveRejections >= 2) {
      const rejectedSummary = messages
        .filter(m => m.role === 'tool' && typeof m.content === 'string' && m.content.startsWith('Rejected:'))
        .slice(-3)
        .map(m => m.content as string)
        .join('\n')
      messages.push({
        role: 'user',
        content: `Some suggestions were rejected. Resolve each using the exact category names from AVAILABLE CATEGORIES, correct conditions, and call finish_analysis.\n\nRejected:\n${rejectedSummary}`,
      })
    }
  }

  // ── Write rules to DB ────────────────────────────────────────────────────────
  console.log(`\n💾  Writing ${accepted.length} rules to database…`)

  let written = 0
  for (const rule of accepted) {
    // Upsert payee if needed
    let payeeId = rule.payeeId
    if (rule.payeeName && !payeeId) {
      const p = await prisma.payee.upsert({
        where: { userId_name: { userId, name: rule.payeeName } },
        update: {},
        create: { userId, name: rule.payeeName },
      })
      payeeId = p.id
    }

    // Build a readable rule name
    const conditions = rule.conditions as { all?: Array<{field: string; operator: string; value: string}>; any?: Array<{field: string; operator: string; value: string}> }
    const firstCond = (conditions.all ?? conditions.any ?? [])[0]
    const name = rule.payeeName
      ? `${rule.payeeName} → ${rule.categoryName}`
      : firstCond
        ? `${firstCond.value} → ${rule.categoryName}`
        : rule.categoryName

    await prisma.categorizationRule.create({
      data: {
        userId,
        name,
        priority: 50,
        conditions: rule.conditions as never,
        categoryName: rule.categoryName,
        categoryId: rule.categoryId,
        payeeId: payeeId ?? null,
        isActive: true,
      },
    })
    written++
    console.log(`  ✓ "${name}"`)
  }

  console.log(`\n✅  Done — ${written} rules created for ${userId}`)
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})

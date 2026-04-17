/**
 * Background rules agent runner.
 *
 * Runs the same LLM analysis as the SSE route but persists suggestions directly to
 * the RuleSuggestion table instead of streaming them. Used for automatic post-import
 * analysis so the user sees suggestions the next time they open the rules UI.
 *
 * Does NOT enforce the 30-second cooldown (that's a UI-facing rate limit). Does update
 * lastRulesAgentRun so the SSE endpoint won't fire again within 30 seconds of this run.
 */

import { prisma } from '@/lib/prisma'
import { parsePreferences } from '@/types/preferences'
import { openrouterWithTools, type ChatMessage } from '@/lib/llm/openrouter'
import {
  RULES_TOOLS,
  dispatchRulesTool,
  loadRulesContext,
  type RulesContext,
  type RulesSseEvent,
} from '@/lib/agent/rules-tools'
import { dispatchTool } from '@/lib/agent/finance-tools'

// Shared with the SSE route — kept in sync manually.
// If you update the system prompt in route.ts, update this one too.
const SYSTEM_PROMPT = `You are an expert financial categorisation assistant. Your job is to analyse the user's transaction data and suggest high-quality automation rules.

ALL data is pre-loaded in the user message. Do NOT call get_rules, get_categories, get_uncategorised_transactions, get_no_payee_transactions, get_payees, get_ruleless_patterns, get_project_transactions, or get_transfer_candidates — the data is already there.

CRITICAL — CATEGORY NAMES:
- The user message contains an "AVAILABLE CATEGORIES" section. Read it FIRST before doing anything else.
- categoryName MUST be copied VERBATIM (exact spelling, exact capitalisation) from that list.
- Do NOT use generic names like "Housing", "Education", "Food", "Transport", "Transfers & other" unless those exact strings appear in the list.
- The taxonomy is user-specific — it may be IRS Schedule C, Schedule E, or personal finance categories. Only use what is in the list.
- If no category fits perfectly, pick the closest match from the list. Never invent a name.

Workflow:
1. Read the AVAILABLE CATEGORIES list carefully — identify the exact category name for each merchant group
2. Call record_plan FIRST — before any other tool. List your TOP 20 merchant groups in ONE LINE EACH: "merchant → category (payee: PayeeName) [project: ProjectName]" or "merchant → SKIP (reason)". Only include [project: X] when the pattern clearly belongs to one project. Do NOT add explanatory notes, transaction counts, or reasoning — just the one-line mapping per merchant. The execution model copies payee and project names directly from this plan, so spell them correctly. Do NOT call query_transactions before record_plan.
3. Emit ALL suggestions in a SINGLE round by calling emit_rule_suggestion multiple times in one response — do NOT spread them across multiple rounds
4. If any suggestion is rejected for a bad categoryName or workspaceName, look at the full list in the rejection message and resubmit with the correct name immediately
5. Call finish_analysis

SOURCES OF PATTERNS — SELF-LEARNING:
The user message contains FIVE sources of patterns. Treat all five equally:
1. UNCATEGORISED TRANSACTIONS — no category yet; suggest a category + payee rule
2. TRANSACTIONS WITH CATEGORY BUT NO PAYEE — already categorised; suggest a payee-assignment rule that reinforces the user's manual work
3. ALREADY-LABELLED PATTERNS WITHOUT A RULE — the user manually tagged these; create rules to automate future occurrences. Use the "category" field shown to confirm the right category name
4. PROJECT-TAGGED TRANSACTIONS WITHOUT A PROJECT RULE — the user assigned these to a project; create rules so future similar transactions are auto-assigned. Set workspaceName from the "project" field shown
5. ACCOUNT TRANSFER CANDIDATES — same-day debit/credit pairs across different accounts whose amounts match closely. These are almost certainly internal fund movements (bank transfer, moving money between accounts). Suggest a rule with category "Account transfer" (or the closest match in the AVAILABLE CATEGORIES list) for the description keywords found on each side. Transfer rules are HIGH priority — they prevent fund movements from inflating spending or income reports. Use description contains with the common keyword from the debit or credit side.

PAYEE ASSIGNMENT — CRITICAL:
- ALWAYS set payeeName on every suggestion where the merchant/counterparty is identifiable — this means nearly every suggestion should have a payee
- The merchant name from the description IS the payee: "The Lobster Pot" → payee "The Lobster Pot". "FALCO SLICE" → payee "Falco Slice". You do NOT need global brand recognition — any named restaurant, shop, service, or venue has an identifiable name that should be used as the payee
- Use your world knowledge for well-known brands: "Wayfair", "Zalando", "Stripe", "GitHub", "Netflix", "Spotify", "Uber", "Amazon", "AWS", "PIKAPODS", "FlixBus", "Railcard", etc. — use the canonical brand name
- Only leave payeeName null if the counterparty is genuinely ambiguous (e.g. "Bank transfer ref 12345")
- Check the EXISTING PAYEES list first — if the payee already exists there, use the exact same spelling

PROJECT ASSIGNMENT:
- workspaceName MUST be copied VERBATIM from the AVAILABLE PROJECTS list — do not invent or abbreviate
- Only set workspaceName when the pattern unambiguously belongs to one project
- Leave workspaceName null when you are not confident

RULE CONDITIONS — CRITICAL:
- Valid fields: description, payeeName, amount, accountName. Do NOT use "date" — it is not a valid field and will be rejected.
- ALWAYS use description contains as the PRIMARY condition. It matches the raw transaction text and is the most reliable.
- payeeName equals is SECONDARY — only add it if there is already a payee in the EXISTING PAYEES list.
- NEVER use "payeeName equals X" as the condition when you are also setting payeeName to X in the action — that is a no-op.
- Never add a date condition. Rules are not time-bound.
- "all" means AND — every condition must match the SAME transaction. Do NOT put multiple description variants in "all".
- For multiple description variants use "any" (OR logic) — or better, pick the ONE keyword that appears in all variants.
- Matching is case-insensitive — never add two conditions that differ only by capitalisation.
- NEVER use payment processor names as keywords: Adyen, Stripe, PayPal, Square, SumUp, Mollie, Klarna, Mangopay, Braintree.

RULE QUALITY:
- 2+ matching transactions = high confidence; 1 or world-knowledge = medium
- 1 sentence reasoning referencing the specific pattern observed
- Aim for 5–20 suggestions prioritised by financial impact (highest absolute spend first)
- SKIP any merchant that appears in the EXISTING RULES list — a rule already covers it

TRANSACTION ANALYSIS — LOOK AT INDIVIDUAL AMOUNTS:
- Round amounts (−50.00, −100.00, −200.00, −500.00) at convenience stores, gas stations, kiosks, or supermarkets almost always indicate ATM cash withdrawals, NOT purchases. Do NOT categorise these as groceries, fuel, etc.
- Amounts that are exact multiples of 10 or 50 with no cents at a physical retail location are a strong signal of cash withdrawal, not a purchase.`

const MAX_TOOL_ROUNDS = 16

export async function runRulesAgentInBackground(userId: string): Promise<void> {
  const runId = Math.random().toString(36).slice(2, 10)
  console.log(`[rules-agent-bg:${runId}] starting for userId:${userId}`)

  // Update lastRulesAgentRun so the SSE endpoint won't immediately fire again
  const pref = await prisma.userPreference.findUnique({ where: { userId } })
  await prisma.userPreference.upsert({
    where: { userId },
    update: { data: { ...parsePreferences(pref?.data), lastRulesAgentRun: Date.now() } as never },
    create: { userId, data: { lastRulesAgentRun: Date.now() } },
  })

  const recentCutoff = new Date()
  recentCutoff.setMonth(recentCutoff.getMonth() - 18)

  const [txCount, uncatCount, noPayeeCount, activeRuleCount, recentUncatCount] = await Promise.all([
    prisma.transaction.count({ where: { account: { userId } } }),
    prisma.transaction.count({ where: { account: { userId }, categoryId: null } }),
    prisma.transaction.count({ where: { account: { userId }, categoryId: { not: null }, payeeId: null } }),
    prisma.categorizationRule.count({ where: { userId, isActive: true } }),
    prisma.transaction.count({ where: { account: { userId }, categoryId: null, date: { gte: recentCutoff } } }),
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

Focus first on patterns from the last 18 months (since ${recentCutoff.toISOString().slice(0, 10)}).`

  const preloaded = await loadRulesContext(userId)

  // Collect suggestions to persist at the end of the run
  type PendingSuggestion = {
    conditions: object
    categoryName: string
    categoryId: string | null
    payeeName: string | null
    payeeId: string | null
    workspaceId: string | null
    workspaceName: string | null
    confidence: string
    impact: string
    reasoning: string
    matchCount: number
    totalAmount: number
  }
  const pendingSuggestions: PendingSuggestion[] = []

  const ctx: RulesContext = {
    send: (event: RulesSseEvent) => {
      if (event.type === 'suggestion' && event.rule) {
        pendingSuggestions.push({
          conditions: event.rule.conditions as object,
          categoryName: event.rule.categoryName,
          categoryId: event.rule.categoryId,
          payeeName: event.rule.payeeName,
          payeeId: event.rule.payeeId,
          workspaceId: event.rule.workspaceId,
          workspaceName: event.rule.workspaceName,
          confidence: event.rule.confidence,
          impact: event.rule.impact,
          reasoning: event.rule.reasoning,
          matchCount: event.matchCount ?? 0,
          totalAmount: event.totalAmount ?? 0,
        })
      }
    },
    ...preloaded,
    coveredThisRun: new Set<string>(),
  }

  const [uncatData, catsData, noPayeeData, payeesData, rulesData, rulelessData, projectTxData, transferData] = await Promise.all([
    dispatchRulesTool(userId, 'get_uncategorised_transactions', { topN: 25 }, ctx),
    dispatchRulesTool(userId, 'get_categories', {}, ctx),
    dispatchRulesTool(userId, 'get_no_payee_transactions', { topN: 15 }, ctx),
    dispatchTool(userId, 'get_payees', {}),
    dispatchRulesTool(userId, 'get_rules', {}, ctx),
    dispatchRulesTool(userId, 'get_ruleless_patterns', { topN: 20 }, ctx),
    dispatchRulesTool(userId, 'get_project_transactions', { topN: 15 }, ctx),
    dispatchRulesTool(userId, 'get_transfer_candidates', { topN: 20 }, ctx),
  ])

  const projectsList = preloaded.workspaceMap.size > 0
    ? [...preloaded.workspaceMap.keys()].map((n) => `  ${n}`).join('\n')
    : '  (no projects set up)'

  const userMessage = `${snapshot}

--- AVAILABLE CATEGORIES (copy names VERBATIM from this list) ---
${catsData}

--- AVAILABLE PROJECTS (copy names VERBATIM when setting workspaceName) ---
${projectsList}

--- EXISTING PAYEES (reuse exact spelling if the merchant matches) ---
${payeesData}

--- EXISTING RULES (SKIP merchants already covered here — do not suggest duplicate rules) ---
${rulesData}

--- UNCATEGORISED TRANSACTIONS NOT COVERED BY EXISTING RULES (top 25 by spend) ---
${uncatData}

--- TRANSACTIONS WITH CATEGORY BUT NO PAYEE (top 15) ---
${noPayeeData}

--- ALREADY-LABELLED PATTERNS WITHOUT A RULE (top 20 by count) ---
These transactions were manually tagged by the user. Formalise them as rules so future transactions are auto-labelled. Use the "category" and "payee" fields shown — do NOT change what the user already decided.
${rulelessData}

--- PROJECT-TAGGED TRANSACTIONS WITHOUT A PROJECT RULE (top 15) ---
These transactions already have a project assigned. Create rules so future similar transactions are automatically assigned to the same project. Set workspaceName using the "project" field shown (copy VERBATIM from AVAILABLE PROJECTS).
${projectTxData}

--- ACCOUNT TRANSFER CANDIDATES (same-day matching debit/credit across different accounts) ---
These are likely internal fund movements. Suggest an "Account transfer" rule (or the closest category in the list above) for each distinct description pattern seen here. HIGH PRIORITY — transfer rules prevent fund movements from inflating spending or income totals.
${transferData}

Instructions:
1. Call record_plan listing every merchant group you spotted → category → payee → [project if applicable]
2. Emit ALL suggestions in ONE response (call emit_rule_suggestion multiple times at once)
3. Use the "descriptions" field to pick the right keyword for each condition
4. If a suggestion is rejected, fix and resubmit immediately
5. Call finish_analysis`

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  const STRATEGY_MODEL = 'anthropic/claude-sonnet-4.6'
  const EXECUTION_MODEL = 'anthropic/claude-haiku-4.5'
  const PRELOADED = ['get_rules', 'get_categories', 'get_uncategorised_transactions', 'get_no_payee_transactions', 'get_payees', 'get_ruleless_patterns', 'get_project_transactions', 'get_transfer_candidates']

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

  const t0 = Date.now()

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (finished) break

    const lastMsg = messages.at(-1)
    const isStrategyRound = round === 0 || (lastMsg?.role === 'user' && round > 0)
    const model = isStrategyRound ? STRATEGY_MODEL : EXECUTION_MODEL

    console.log(`[rules-agent-bg:${runId}] round:${round + 1} [${model.split('/').pop()}]`)

    let response
    try {
      response = await openrouterWithTools(messages, RULES_TOOLS, model)
    } catch (err) {
      console.error(`[rules-agent-bg:${runId}] LLM error on round ${round + 1}:`, err instanceof Error ? err.message : err)
      break
    }

    const assistantMsg: Record<string, unknown> = { role: 'assistant' }
    if (response.content) assistantMsg.content = response.content
    if (response.tool_calls) assistantMsg.tool_calls = response.tool_calls
    if (!assistantMsg.content && !assistantMsg.tool_calls) assistantMsg.content = ''
    messages.push(assistantMsg as unknown as ChatMessage)

    if (!response.tool_calls || response.tool_calls.length === 0) {
      finished = true
      break
    }

    const roundHasEmit = response.tool_calls.some((tc) => tc.function.name === 'emit_rule_suggestion')
    const roundHasRecordPlan = response.tool_calls.some((tc) => tc.function.name === 'record_plan')

    if (everEmitted && !roundHasEmit) break

    for (const tc of response.tool_calls) {
      const toolName = tc.function.name
      let args: unknown
      try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

      if (round === 0 && !roundHasRecordPlan && (toolName === 'query_transactions' || toolName === 'search_transactions')) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'You must call record_plan FIRST before querying transactions.' })
        continue
      }

      if (PRELOADED.includes(toolName)) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: `This data is already pre-loaded in the user message above. Do not call ${toolName} again — use the data already provided and emit your suggestions.` })
        continue
      }

      if (toolName === 'query_transactions' || toolName === 'search_transactions') {
        queryCount++
        if (queryCount > MAX_QUERIES) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Query limit reached. Emit your suggestions now using emit_rule_suggestion, then call finish_analysis.' })
          continue
        }
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
          if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS || totalRejections >= MAX_TOTAL_REJECTIONS) {
            finished = true
            break
          }
        }
      }

      if (result === 'FINISH_ANALYSIS') { finished = true; break }
    }

    if (!finished && roundHasEmit && emitCount > 0) everEmitted = true

    if (everEmitted && consecutiveRejections >= 2 && !response.tool_calls.some((tc) => tc.function.name === 'finish_analysis')) {
      const rejectedSummary = messages
        .filter((m) => m.role === 'tool')
        .map((m) => String(m.content))
        .filter((c) => c.startsWith('Rejected:'))
        .slice(-3)
        .join('\n')
      messages.push({
        role: 'user',
        content: `Some suggestions were rejected. Please resolve each one using the exact category names from the AVAILABLE CATEGORIES list, correct conditions, and call finish_analysis when done.\n\nRejected:\n${rejectedSummary}`,
      })
    }
  }

  console.log(`[rules-agent-bg:${runId}] LLM done — ${pendingSuggestions.length} suggestions, totalMs:${Date.now() - t0}`)

  // Persist suggestions to DB — user will see them in the rules UI
  if (pendingSuggestions.length > 0) {
    await prisma.ruleSuggestion.createMany({
      data: pendingSuggestions.map((s) => ({
        userId,
        status: 'PENDING',
        conditions: s.conditions,
        categoryName: s.categoryName,
        categoryId: s.categoryId,
        payeeName: s.payeeName,
        payeeId: s.payeeId,
        workspaceId: s.workspaceId,
        workspaceName: s.workspaceName,
        confidence: s.confidence,
        impact: s.impact,
        reasoning: s.reasoning,
        matchCount: s.matchCount,
        totalAmount: s.totalAmount,
        sourceEdits: [],
      })),
      skipDuplicates: false,
    })
    console.log(`[rules-agent-bg:${runId}] persisted ${pendingSuggestions.length} RuleSuggestion rows`)
  }
}

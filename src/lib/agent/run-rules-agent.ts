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
import { recordAgentUsage } from './usage'

// ── System prompt (single source of truth) ────────────────────────────────────

export const RULES_AGENT_SYSTEM_PROMPT = `You are an expert financial categorisation assistant. Your job is to analyse the user's transaction data and suggest high-quality automation rules.

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
1. UNCATEGORISED TRANSACTIONS — no category yet; suggest a category + payee rule using description contains
2. TRANSACTIONS WITH CATEGORY BUT NO PAYEE — already categorised; suggest a rule that assigns the missing payee. Use description contains as the primary condition. Copy categoryName VERBATIM from the "category:" field shown for that group — do NOT guess or substitute a different name. The rule formalises the existing label and assigns the payee; it must fire on fresh imports that arrive without a payee.
3. ALREADY-LABELLED PATTERNS WITHOUT A RULE — the user manually tagged these; formalise them as rules. Use description contains as the primary condition, NOT payeeName equals — even when a payee is shown, the rule must fire on raw transactions that don't yet have a payee assigned. Copy both categoryName and payeeName VERBATIM from the "category:" and "payee:" fields in the data.
4. PROJECT-TAGGED TRANSACTIONS WITHOUT A PROJECT RULE — the user assigned these to a project; create rules so future similar transactions are auto-assigned. Set workspaceName from the "project" field shown
5. LIKELY ACCOUNT TRANSFERS — same-day debit/credit pairs across different accounts. These are almost certainly internal fund movements (bank transfer, moving money between accounts). Suggest a rule with category "Account transfer" (or the closest match in the AVAILABLE CATEGORIES list) for the description keywords shown. Transfer rules are HIGH priority — they prevent fund movements from inflating spending or income reports. Use description contains with the common keyword from the debit or credit side.

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

const PRELOADED_TOOLS = new Set([
  'get_rules', 'get_categories', 'get_uncategorised_transactions',
  'get_no_payee_transactions', 'get_payees', 'get_ruleless_patterns',
  'get_project_transactions', 'get_transfer_candidates',
])

const MAX_TOOL_ROUNDS = 16
const STRATEGY_MODEL = 'anthropic/claude-sonnet-4.6'
const EXECUTION_MODEL = 'anthropic/claude-haiku-4.5'

// ── Core agent function ───────────────────────────────────────────────────────

export interface RunRulesAgentOptions {
  signal?: AbortSignal
  runId?: string
  sourceEditIds?: Set<string>
}

export async function runRulesAgent(
  userId: string,
  send: (event: RulesSseEvent) => void,
  options: RunRulesAgentOptions = {}
): Promise<{ emitCount: number; uncategorised: number; noPayee: number }> {
  const runId = options.runId ?? Math.random().toString(36).slice(2, 10)

  // ── Snapshot ────────────────────────────────────────────────────────────────
  send({ type: 'status', message: 'Loading your financial data…' })

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

Focus first on patterns from the last 18 months (since ${recentCutoff.toISOString().slice(0, 10)}). The full history is available via query_transactions if a pattern spans a longer period.`

  // ── Context + pre-fetch ─────────────────────────────────────────────────────
  send({ type: 'status', message: 'Loading rules context…' })
  const preloaded = await loadRulesContext(userId)

  const ctx: RulesContext = {
    send,
    ...preloaded,
    coveredThisRun: new Set<string>(),
    sourceEditIds: options.sourceEditIds,
  }

  send({ type: 'status', message: 'Fetching data…' })

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
    ? [...preloaded.workspaceMap.keys()].map(n => `  ${n}`).join('\n')
    : '  (no projects set up)'

  console.log(`[rules-agent:${runId}] context loaded`, JSON.stringify({
    categoryCount: preloaded.categoryMap.size,
    workspaceCount: preloaded.workspaceMap.size,
  }))

  // ── Build user message ──────────────────────────────────────────────────────
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

--- LIKELY ACCOUNT TRANSFERS (top 20) ---
Same-day debit/credit pairs across different accounts. Suggest a rule with category "Account transfer" (or closest match) for the description keywords shown. These are HIGH priority — they prevent fund movements from inflating spending/income reports.
${transferData}

Instructions:
1. Call record_plan listing every merchant group you spotted → category → payee → [project if applicable]
2. Emit ALL suggestions in ONE response (call emit_rule_suggestion multiple times at once)
3. Use the "descriptions" field to pick the right keyword for each condition
4. If a suggestion is rejected, fix and resubmit immediately
5. Call finish_analysis`

  const messages: ChatMessage[] = [
    { role: 'system', content: RULES_AGENT_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  // ── LLM loop ────────────────────────────────────────────────────────────────
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

  let totalInput = 0
  let totalOutput = 0
  const t0 = Date.now()

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (options.signal?.aborted) break

    const lastMsg = messages.at(-1)
    const isStrategyRound = round === 0 || (lastMsg?.role === 'user' && round > 0)
    const model = isStrategyRound ? STRATEGY_MODEL : EXECUTION_MODEL

    console.log(`[rules-agent:${runId}] round:start`, JSON.stringify({ round: round + 1, model, messages: messages.length, emitCount, lastRole: messages.at(-1)?.role }))
    send({ type: 'status', message: round === 0 ? 'Sonnet planning…' : `Haiku emitting (round ${round + 1})…` })

    const response = await openrouterWithTools(messages, RULES_TOOLS, model)
    if (response.usage) {
      totalInput += response.usage.inputTokens
      totalOutput += response.usage.outputTokens
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

    const roundHasEmit = response.tool_calls.some(tc => tc.function.name === 'emit_rule_suggestion')
    if (everEmitted && !roundHasEmit) break

    type RoundOutcome = { tool: string; status: string; detail: string }
    const roundOutcomes: RoundOutcome[] = []
    const roundHasRecordPlan = response.tool_calls.some(tc => tc.function.name === 'record_plan')

    for (const tc of response.tool_calls) {
      const toolName = tc.function.name
      let args: unknown
      try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

      if (PRELOADED_TOOLS.has(toolName)) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: `This data is already pre-loaded in the user message. Do not call ${toolName} again — use the data already provided.` })
        continue
      }

      if (round >= 1 && !roundHasRecordPlan && !everEmitted && (toolName === 'query_transactions' || toolName === 'search_transactions')) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'You must call record_plan FIRST before querying transactions. Call record_plan now with your analysis plan, then you may query for additional detail.' })
        roundOutcomes.push({ tool: toolName, status: 'blocked:no-plan-yet', detail: '' })
        continue
      }

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
            if (droppedEmits > 0) console.log(`[rules-agent:${runId}] MAX_EMITS reached — dropping ${droppedEmits} remaining emit call(s)`)
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
        roundOutcomes.push({ tool: toolName, status: 'ok', detail: result.slice(0, 200) })
      }

      if (result === 'FINISH_ANALYSIS') {
        finished = true
        break
      }
    }

    const accepted = roundOutcomes.filter(o => o.status === '✓').length
    const rejected = roundOutcomes.filter(o => o.status === '✗').length
    console.log(`[rules-agent:${runId}] round:${round + 1} summary — ${accepted} accepted, ${rejected} rejected, ${roundOutcomes.length} total calls`)
    for (const o of roundOutcomes) {
      console.log(`  [${o.status}] ${o.tool}${o.detail ? ': ' + o.detail : ''}`)
    }

    if (finished) break
    if (roundHasEmit && emitCount > 0) everEmitted = true

    if (everEmitted && consecutiveRejections >= 2 && !roundOutcomes.some(o => o.tool === 'finish_analysis')) {
      const rejectedSummary = roundOutcomes.filter(o => o.status === '✗').map(o => o.detail).join('\n')
      messages.push({
        role: 'user',
        content: `Some suggestions were rejected. Please resolve each one using the exact category names from the AVAILABLE CATEGORIES list, correct conditions, and call finish_analysis when done.\n\nRejected:\n${rejectedSummary}`,
      })
      console.log(`[rules-agent:${runId}] escalating to Sonnet for cleanup`, JSON.stringify({ consecutiveRejections, emitCount }))
      send({ type: 'status', message: 'Sonnet resolving rejections…' })
    }
  }

  console.log(`[rules-agent:${runId}] done`, JSON.stringify({ emitCount, messages: messages.length, totalMs: Date.now() - t0 }))

  // Record usage (fire-and-forget)
  recordAgentUsage({
    userId,
    endpoint: 'rules',
    model: `${STRATEGY_MODEL}+${EXECUTION_MODEL}`,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    toolRounds: emitCount,
    durationMs: Date.now() - t0,
  })

  return { emitCount, uncategorised: uncatCount, noPayee: noPayeeCount }
}

// ── Background runner (post-import, persists to DB) ───────────────────────────

export async function runRulesAgentInBackground(userId: string, sourceEditIds?: Set<string>): Promise<void> {
  const runId = Math.random().toString(36).slice(2, 10)
  console.log(`[rules-agent-bg:${runId}] starting for userId:${userId}`)

  const { parsePreferences } = await import('@/types/preferences')
  const pref = await prisma.userPreference.findUnique({ where: { userId } })

  // AI rule suggestions are opt-in — skip silently when the user hasn't enabled them.
  if (!parsePreferences(pref?.data).aiRuleSuggestions) {
    console.log(`[rules-agent-bg:${runId}] skipped — aiRuleSuggestions not enabled for userId:${userId}`)
    return
  }

  await prisma.userPreference.upsert({
    where: { userId },
    update: { data: { ...parsePreferences(pref?.data), lastRulesAgentRun: Date.now() } as never },
    create: { userId, data: { lastRulesAgentRun: Date.now() } },
  })

  type PendingSuggestion = {
    conditions: object; categoryName: string; categoryId: string | null
    payeeName: string | null; payeeId: string | null; workspaceId: string | null
    workspaceName: string | null; confidence: string; impact: string
    reasoning: string; matchCount: number; totalAmount: number
  }
  const pendingSuggestions: PendingSuggestion[] = []

  await runRulesAgent(userId, (event) => {
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
  }, { runId, sourceEditIds })

  if (pendingSuggestions.length > 0) {
    await prisma.ruleSuggestion.createMany({
      data: pendingSuggestions.map(s => ({
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

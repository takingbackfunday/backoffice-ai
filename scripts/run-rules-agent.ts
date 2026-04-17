#!/usr/bin/env tsx
/**
 * Run the rules agent for a specific userId and print all suggestions.
 * Usage: pnpm tsx scripts/run-rules-agent.ts <userId>
 */

import type { ChatMessage } from '../src/lib/llm/openrouter'
import type { RulesContext, RulesSseEvent } from '../src/lib/agent/rules-tools'

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://neondb_owner:npg_NGJVWsFuk58h@ep-super-wave-alq120gl.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
process.env.DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL

const userId = process.argv[2]
if (!userId) {
  console.error('Usage: pnpm tsx scripts/run-rules-agent.ts <userId>')
  process.exit(1)
}

const SYSTEM_PROMPT = `You are an expert financial categorisation assistant. Your job is to analyse the user's transaction data and suggest high-quality automation rules.

ALL data is pre-loaded in the user message. Do NOT call get_rules, get_categories, get_uncategorised_transactions, get_no_payee_transactions, get_payees, get_ruleless_patterns, or get_project_transactions — the data is already there.

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
The user message contains FOUR sources of patterns. Treat all four equally:
1. UNCATEGORISED TRANSACTIONS — no category yet; suggest a category + payee rule
2. TRANSACTIONS WITH CATEGORY BUT NO PAYEE — already categorised; suggest a payee-assignment rule that reinforces the user's manual work
3. ALREADY-LABELLED PATTERNS WITHOUT A RULE — the user manually tagged these; create rules to automate future occurrences. Use the "category" field shown to confirm the right category name
4. PROJECT-TAGGED TRANSACTIONS WITHOUT A PROJECT RULE — the user assigned these to a project; create rules so future similar transactions are auto-assigned. Set workspaceName from the "project" field shown

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
- Aim for 5–20 suggestions prioritised by financial impact (highest absolute spend first)
- SKIP any merchant that appears in the EXISTING RULES list — a rule already covers it
- For ALREADY-LABELLED PATTERNS, the "category" and "payee" fields tell you what the user already set — use exactly those values

TRANSACTION ANALYSIS — LOOK AT INDIVIDUAL AMOUNTS:
- Each description now shows its individual amount in parentheses. ALWAYS examine these before suggesting a rule for a group.
- Round amounts (−50.00, −100.00, −200.00, −500.00) at convenience stores, gas stations, kiosks, or supermarkets almost always indicate ATM cash withdrawals, NOT purchases at that merchant. Do NOT categorise these as groceries, fuel, etc. — skip the group or flag it as "Cash withdrawal" if that category exists.
- When a group mixes round amounts and small irregular amounts, the round amounts are likely ATM withdrawals. Consider whether a single rule for the whole group is appropriate.
- Amounts that are exact multiples of 10 or 50 with no cents at a physical retail location are a strong signal of cash withdrawal, not a purchase.`

const MAX_TOOL_ROUNDS = 16

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { openrouterWithTools } = await import('../src/lib/llm/openrouter')
  const { RULES_TOOLS, dispatchRulesTool, loadRulesContext } = await import('../src/lib/agent/rules-tools')
  const { dispatchTool } = await import('../src/lib/agent/finance-tools')

  console.log(`\n🤖 Rules agent starting for userId: ${userId}\n`)

  // ── Step 1: snapshot ──────────────────────────────────────────────────────────
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

  console.log(`📊 Snapshot:`)
  console.log(`   Total transactions: ${txCount} (${dateRange._min.date?.toISOString().slice(0, 10)} → ${dateRange._max.date?.toISOString().slice(0, 10)})`)
  console.log(`   Uncategorised: ${uncatCount} total, ${recentUncatCount} in last 18 months`)
  console.log(`   With category but no payee: ${noPayeeCount}`)
  console.log(`   Active rules: ${activeRuleCount}\n`)

  const snapshot = `Financial database snapshot:
- Total transactions: ${txCount} (date range: ${dateRange._min.date?.toISOString().slice(0, 10) ?? 'n/a'} → ${dateRange._max.date?.toISOString().slice(0, 10) ?? 'n/a'})
- Uncategorised transactions: ${uncatCount} total, ${recentUncatCount} in the last 18 months
- Transactions with category but no payee: ${noPayeeCount}
- Active categorisation rules: ${activeRuleCount}

Focus first on patterns from the last 18 months (since ${recentCutoff.toISOString().slice(0, 10)}).`

  // ── Step 2: pre-load ──────────────────────────────────────────────────────────
  console.log('⏳ Loading context...')
  const preloaded = await loadRulesContext(userId)

  const suggestions: unknown[] = []

  const ctx: RulesContext = {
    send: (event: RulesSseEvent) => {
      if (event.type === 'suggestion' && event.rule) {
        suggestions.push({ rule: event.rule, matchCount: event.matchCount, totalAmount: event.totalAmount, sampleTransactions: event.sampleTransactions })
      }
    },
    ...preloaded,
    coveredThisRun: new Set<string>(),
  }

  console.log(`   Transactions loaded: ${preloaded.transactions.length}`)
  console.log(`   Categories: ${preloaded.categoryMap.size}`)
  console.log(`   Payees: ${preloaded.payeeMap.size}`)
  console.log(`   Projects: ${preloaded.workspaceMap.size} (${[...preloaded.workspaceMap.keys()].join(', ') || 'none'})`)

  console.log('\n⏳ Fetching all data sections...')
  const [uncatData, catsData, noPayeeData, payeesData, rulesData, rulelessData, projectTxData] = await Promise.all([
    dispatchRulesTool(userId, 'get_uncategorised_transactions', { topN: 25 }, ctx),
    dispatchRulesTool(userId, 'get_categories', {}, ctx),
    dispatchRulesTool(userId, 'get_no_payee_transactions', { topN: 15 }, ctx),
    dispatchTool(userId, 'get_payees', {}),
    dispatchRulesTool(userId, 'get_rules', {}, ctx),
    dispatchRulesTool(userId, 'get_ruleless_patterns', { topN: 20 }, ctx),
    dispatchRulesTool(userId, 'get_project_transactions', { topN: 15 }, ctx),
  ])

  const projectsList = preloaded.workspaceMap.size > 0
    ? [...preloaded.workspaceMap.keys()].map(n => `  ${n}`).join('\n')
    : '  (no projects set up)'

  console.log('\n📋 Data sections:')
  console.log(`   Uncategorised groups:    ${uncatData.split('\n').length} lines`)
  console.log(`   Categories available:    ${catsData.split('\n').length} lines`)
  console.log(`   No-payee groups:         ${noPayeeData.split('\n').length} lines`)
  console.log(`   Ruleless patterns:       ${rulelessData.split('\n').length} lines`)
  console.log(`   Project tx patterns:     ${projectTxData.split('\n').length} lines`)
  console.log(`   Existing rules:          ${rulesData.split('\n').length} lines`)

  // Print raw data sections for assessment
  console.log('\n' + '─'.repeat(80))
  console.log('UNCATEGORISED TRANSACTIONS:')
  console.log(uncatData.slice(0, 3000))
  console.log('\n' + '─'.repeat(80))
  console.log('ALREADY-LABELLED PATTERNS WITHOUT A RULE:')
  console.log(rulelessData.slice(0, 3000))
  console.log('\n' + '─'.repeat(80))
  console.log('PROJECT-TAGGED TRANSACTIONS:')
  console.log(projectTxData.slice(0, 3000))
  console.log('\n' + '─'.repeat(80))

  // ── Step 3: LLM ──────────────────────────────────────────────────────────────
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

  console.log('\n🧠 Starting LLM analysis...\n')

  let finished = false
  let emitCount = 0
  let totalRejections = 0
  let consecutiveRejections = 0
  const MAX_EMITS = 20
  const MAX_CONSECUTIVE_REJECTIONS = 5
  const MAX_TOTAL_REJECTIONS = 12
  let queryCount = 0
  const MAX_QUERIES = 2
  let everEmitted = false

  const STRATEGY_MODEL = 'anthropic/claude-sonnet-4.6'
  const EXECUTION_MODEL = 'anthropic/claude-haiku-4.5'
  const PRELOADED = ['get_rules', 'get_categories', 'get_uncategorised_transactions', 'get_no_payee_transactions', 'get_payees', 'get_ruleless_patterns', 'get_project_transactions']

  for (let round = 0; round < MAX_TOOL_ROUNDS && !finished; round++) {
    const lastMsg = messages.at(-1)
    const isStrategyRound = round === 0 || (lastMsg?.role === 'user' && round > 0)
    const model = isStrategyRound ? STRATEGY_MODEL : EXECUTION_MODEL

    process.stdout.write(`  Round ${round + 1} [${model.split('/')[1]}]... `)
    const response = await openrouterWithTools(messages, RULES_TOOLS, model)

    const assistantMsg: Record<string, unknown> = { role: 'assistant' }
    if (response.content) assistantMsg.content = response.content
    if (response.tool_calls) assistantMsg.tool_calls = response.tool_calls
    if (!assistantMsg.content && !assistantMsg.tool_calls) assistantMsg.content = ''
    messages.push(assistantMsg as unknown as ChatMessage)

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log('(no tool calls — done)')
      finished = true
      break
    }

    const toolNames = response.tool_calls.map(tc => tc.function.name)
    console.log(`tools: [${toolNames.join(', ')}]`)

    const roundHasEmit = response.tool_calls.some(tc => tc.function.name === 'emit_rule_suggestion')
    const roundHasRecordPlan = response.tool_calls.some(tc => tc.function.name === 'record_plan')

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
        messages.push({ role: 'tool', tool_call_id: tc.id, content: `This data is already pre-loaded in the user message above. Do not call ${toolName} again.` })
        continue
      }

      if (toolName === 'query_transactions' || toolName === 'search_transactions') {
        queryCount++
        if (queryCount > MAX_QUERIES) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Query limit reached. Emit your suggestions now.' })
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

      if (toolName === 'record_plan') {
        const a = args as Record<string, unknown>
        console.log(`\n📝 Plan:\n${String(a.summary ?? '').slice(0, 1500)}\n`)
      }

      if (toolName === 'emit_rule_suggestion') {
        const a = args as Record<string, unknown>
        if (result.startsWith('Emitted:')) {
          emitCount++
          consecutiveRejections = 0
          process.stdout.write(`    ✓ [${a.categoryName}] ${a.payeeName ?? '(no payee)'}${a.workspaceName ? ` → project:${a.workspaceName}` : ''} (${result})\n`)
          if (emitCount >= MAX_EMITS) { finished = true; break }
        } else {
          consecutiveRejections++
          totalRejections++
          process.stdout.write(`    ✗ Rejected: ${result.slice(0, 100)}\n`)
          if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS || totalRejections >= MAX_TOTAL_REJECTIONS) {
            finished = true; break
          }
        }
      }

      if (result === 'FINISH_ANALYSIS') { finished = true; break }
    }

    if (roundHasEmit && emitCount > 0) everEmitted = true

    if (everEmitted && consecutiveRejections >= 2 && !response.tool_calls.some(tc => tc.function.name === 'finish_analysis')) {
      const rejectedSummary = messages
        .filter(m => m.role === 'tool')
        .map(m => String(m.content))
        .filter(c => c.startsWith('Rejected:'))
        .slice(-3)
        .join('\n')
      messages.push({
        role: 'user',
        content: `Some suggestions were rejected. Please resolve each one using the exact category names from the AVAILABLE CATEGORIES list, correct conditions, and call finish_analysis when done.\n\nRejected:\n${rejectedSummary}`,
      })
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(80))
  console.log(`✅ ANALYSIS COMPLETE — ${suggestions.length} suggestions generated\n`)

  type Suggestion = {
    rule: {
      categoryName: string
      payeeName: string | null
      workspaceId: string | null
      workspaceName: string | null
      confidence: string
      impact: string
      reasoning: string
      conditions: { all?: unknown[]; any?: unknown[] }
    }
    matchCount: number
    totalAmount: number
    sampleTransactions?: { description: string; amount: number }[]
  }

  for (const [i, s] of (suggestions as Suggestion[]).entries()) {
    const r = s.rule
    const condStr = (r.conditions.all ?? r.conditions.any ?? [])
      .map((c: unknown) => {
        const cond = c as { field: string; operator: string; value: unknown }
        return `${cond.field} ${cond.operator} "${cond.value}"`
      })
      .join(r.conditions.all ? ' AND ' : ' OR ')
    console.log(`${i + 1}. [${r.confidence.toUpperCase()} / ${r.impact}] ${r.categoryName}`)
    console.log(`   Payee:    ${r.payeeName ?? '(none)'}`)
    if (r.workspaceName) console.log(`   Project:  ${r.workspaceName}`)
    console.log(`   Matches:  ~${s.matchCount} txns, £${s.totalAmount?.toFixed(2) ?? '?'} total`)
    console.log(`   Cond:     ${condStr}`)
    console.log(`   Reason:   ${r.reasoning}`)
    if (s.sampleTransactions?.length) {
      console.log(`   Samples:  ${s.sampleTransactions.slice(0, 2).map(t => `"${t.description.slice(0, 50)}" (${t.amount})`).join(' | ')}`)
    }
    console.log()
  }

  // Stats
  const withProject = (suggestions as Suggestion[]).filter(s => s.rule.workspaceName).length
  const withPayee = (suggestions as Suggestion[]).filter(s => s.rule.payeeName).length
  const highConf = (suggestions as Suggestion[]).filter(s => s.rule.confidence === 'high').length
  console.log(`─`.repeat(80))
  console.log(`Summary: ${suggestions.length} total | ${highConf} high confidence | ${withPayee} with payee | ${withProject} with project assignment`)
  console.log(`Rejections: ${totalRejections}`)

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

export const maxDuration = 120

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { openrouterWithTools, type ChatMessage } from '@/lib/llm/openrouter'
import {
  RULES_TOOLS,
  dispatchRulesTool,
  loadRulesContext,
  type RulesContext,
} from '@/lib/agent/rules-tools'

const EditSchema = z.object({
  id: z.string(),
  description: z.string(),
  payeeName: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  amount: z.number(),
})

const RequestSchema = z.object({
  edits: z.array(EditSchema).min(1).max(50),
})

const SYSTEM_PROMPT = `You are a financial categorisation assistant. A user just manually edited several transactions. Use these edits as evidence to suggest automation rules.

Workflow (STRICT — follow this order):
1. Call get_categories ONCE to confirm exact category names
2. Optionally call get_rules ONCE to avoid duplicating existing rules
3. Call record_plan ONCE with your strategy before emitting
4. Emit suggestions using emit_rule_suggestion for each clear pattern (if rejected, read the reason and resubmit with a fix)
5. Call finish_analysis immediately after your last suggestion

CRITICAL constraints:
- Base suggestions ONLY on the patterns visible in the provided edits
- Do NOT call get_uncategorised_transactions or get_no_payee_transactions
- Do NOT call query_transactions or search_transactions
- A pattern needs at least 1 strong edit to be medium confidence; 2+ similar edits = high confidence
- Never use amount as the only condition — always use description or payeeName
- categoryName must exactly match one from get_categories
- reasoning is 1 sentence referencing the edit pattern you observed`

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { edits } = parsed.data
    console.log(`[suggest-from-edits] userId=${userId} edits=${edits.length}`, edits.map(e => `"${e.description}" → ${e.categoryName ?? '(none)'}`))

    // Pre-load context (transactions, category/payee maps, existing rules)
    const preloaded = await loadRulesContext(userId)
    console.log(`[suggest-from-edits] context loaded: ${preloaded.transactions.length} txns, ${preloaded.categoryMap.size} categories, ${preloaded.payeeMap.size} payees`)

    type CollectedSuggestion = {
      conditions: { all?: object[]; any?: object[] }
      categoryName: string
      categoryId: string | null
      payeeName: string | null
      payeeId: string | null
      confidence: 'high' | 'medium'
      impact: string
      reasoning: string
      matchCount: number
      totalAmount: number
    }
    // Collect emitted suggestions in memory
    const collectedSuggestions: CollectedSuggestion[] = []

    const ctx: RulesContext = {
      send: (event) => {
        if (event.type === 'suggestion' && event.rule) {
          collectedSuggestions.push({
            conditions: event.rule.conditions,
            categoryName: event.rule.categoryName,
            categoryId: event.rule.categoryId,
            payeeName: event.rule.payeeName,
            payeeId: event.rule.payeeId,
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
      sourceEditIds: new Set(edits.map((e) => e.id)),
    }

    // Pre-load rules so the agent can skip already-covered merchants
    const rulesData = await dispatchRulesTool(userId, 'get_rules', {}, ctx)
    const catsData = await dispatchRulesTool(userId, 'get_categories', {}, ctx)

    const editsSummary = edits
      .map((e, i) =>
        `Edit ${i + 1}: description="${e.description}"${e.payeeName ? ` payee="${e.payeeName}"` : ''} → category="${e.categoryName ?? '(none)'}" | amount=${e.amount.toFixed(2)}`
      )
      .join('\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `The user just manually edited these ${edits.length} transaction(s):

${editsSummary}

--- AVAILABLE CATEGORIES ---
${catsData}

--- EXISTING RULES (SKIP merchants already covered here) ---
${rulesData}

Analyse the patterns and emit rule suggestions. Do NOT suggest rules for merchants already covered in EXISTING RULES above.`,
      },
    ]

    let finished = false
    let consecutiveRejections = 0
    const MAX_CONSECUTIVE_REJECTIONS = 3
    const MAX_ROUNDS = 8

    for (let round = 0; round < MAX_ROUNDS && !finished; round++) {
      console.log(`[suggest-from-edits] round ${round + 1}/${MAX_ROUNDS}`)
      const response = await openrouterWithTools(messages, RULES_TOOLS, 'anthropic/claude-sonnet-4.6')

      const toolNames = response.tool_calls?.map((tc) => tc.function.name) ?? []
      console.log(`[suggest-from-edits] round ${round + 1} tools:`, toolNames.length ? toolNames : '(none — finished)')

      // Omit content when null/empty alongside tool_calls
      const assistantMsg: Record<string, unknown> = { role: 'assistant' }
      if (response.content) assistantMsg.content = response.content
      if (response.tool_calls) assistantMsg.tool_calls = response.tool_calls
      if (!assistantMsg.content && !assistantMsg.tool_calls) assistantMsg.content = ''
      messages.push(assistantMsg as unknown as ChatMessage)

      if (!response.tool_calls || response.tool_calls.length === 0) {
        finished = true
        break
      }

      for (const tc of response.tool_calls) {
        const toolName = tc.function.name
        let args: unknown
        try {
          args = JSON.parse(tc.function.arguments)
        } catch {
          args = {}
        }

        // Block only heavy transaction-fetch tools
        const BLOCKED = ['query_transactions', 'search_transactions',
          'get_uncategorised_transactions', 'get_no_payee_transactions']
        if (BLOCKED.includes(toolName)) {
          console.log(`[suggest-from-edits] blocked tool: ${toolName}`)
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: 'Do not fetch transactions — base your suggestions only on the edits provided in the user message. Emit rule suggestions now.',
          })
          continue
        }

        let result: string
        try {
          result = await dispatchRulesTool(userId, toolName, args, ctx)
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : String(e)}`
        }

        console.log(`[suggest-from-edits] tool ${toolName} → ${result.slice(0, 120)}`)

        messages.push({ role: 'tool', tool_call_id: tc.id, content: result })

        if (toolName === 'emit_rule_suggestion') {
          if (result.startsWith('Rejected') || result === 'Emitted: 0 new transaction(s) matched.') {
            consecutiveRejections++
            if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
              console.log(`[suggest-from-edits] too many consecutive rejections, stopping`)
              finished = true
              break
            }
          } else {
            consecutiveRejections = 0
          }
        }

        if (result === 'FINISH_ANALYSIS') {
          finished = true
          break
        }
      }
    }

    console.log(`[suggest-from-edits] collected ${collectedSuggestions.length} suggestions`)

    if (collectedSuggestions.length === 0) {
      return ok({ count: 0, suggestions: [] })
    }

    // Persist to DB
    const saved = await Promise.all(
      collectedSuggestions.map((s) =>
        prisma.ruleSuggestion.create({
          data: {
            userId,
            conditions: s.conditions as object,
            categoryName: s.categoryName,
            categoryId: s.categoryId ?? null,
            payeeName: s.payeeName ?? null,
            payeeId: s.payeeId ?? null,
            confidence: s.confidence,
            impact: s.impact,
            reasoning: s.reasoning,
            matchCount: s.matchCount,
            totalAmount: s.totalAmount,
            sourceEdits: edits as unknown as object,
          },
        })
      )
    )

    console.log(`[suggest-from-edits] saved ${saved.length} suggestions to DB`)
    return ok({ count: saved.length, suggestions: saved })
  } catch (err) {
    console.error('[suggest-from-edits] ERROR:', err)
    return serverError('Failed to generate suggestions')
  }
}

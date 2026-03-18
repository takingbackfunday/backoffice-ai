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
3. Emit suggestions using emit_rule_suggestion for each clear pattern
4. Call finish_analysis immediately after your last suggestion

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
    }

    const editsSummary = edits
      .map((e, i) =>
        `Edit ${i + 1}: description="${e.description}"${e.payeeName ? ` payee="${e.payeeName}"` : ''} → category="${e.categoryName ?? '(none)'}" | amount=${e.amount.toFixed(2)}`
      )
      .join('\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `The user just manually edited these ${edits.length} transaction(s):\n\n${editsSummary}\n\nAnalyse the patterns and emit rule suggestions.`,
      },
    ]

    let finished = false
    const MAX_ROUNDS = 6

    for (let round = 0; round < MAX_ROUNDS && !finished; round++) {
      console.log(`[suggest-from-edits] round ${round + 1}/${MAX_ROUNDS}`)
      const response = await openrouterWithTools(messages, RULES_TOOLS, 'minimax/minimax-m2.7')

      const toolNames = response.tool_calls?.map((tc) => tc.function.name) ?? []
      console.log(`[suggest-from-edits] round ${round + 1} tools:`, toolNames.length ? toolNames : '(none — finished)')

      messages.push({
        role: 'assistant',
        content: response.content ?? '',
        ...(response.tool_calls
          ? ({ tool_calls: response.tool_calls } as unknown as Record<string, unknown>)
          : {}),
      } as ChatMessage)

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

        // Block data-fetch tools — this prompt should only use category/rules lookups + emit
        if (toolName === 'query_transactions' || toolName === 'search_transactions' ||
            toolName === 'get_uncategorised_transactions' || toolName === 'get_no_payee_transactions') {
          console.log(`[suggest-from-edits] blocked tool: ${toolName}`)
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: 'Not available in this context. Use the edit data provided and emit suggestions directly.',
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

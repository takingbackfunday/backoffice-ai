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

Workflow:
1. Call get_uncategorised_transactions to find patterns
2. Optionally drill deeper with search_transactions or query_transactions on specific patterns
3. Call get_categories to confirm exact category names
4. Call get_rules to avoid duplicating existing coverage
5. Call get_no_payee_transactions for payee-assignment opportunities
6. For each rule you are confident about, call emit_rule_suggestion
7. When done, call finish_analysis

Constraints on suggestions:
- Never use amount as the only condition — always use description or payeeName
- categoryName must exactly match one of the user's category names (call get_categories first)
- Each suggestion covers distinct transactions (emit_rule_suggestion will reject duplicates)
- 2+ matching transactions required for high confidence; 1 acceptable for medium
- reasoning is 1 sentence
- Aim for 5–20 high-quality suggestions, not quantity`

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

        const [txCount, uncatCount, noPayeeCount, activeRuleCount] = await Promise.all([
          prisma.transaction.count({ where: { account: { userId } } }),
          prisma.transaction.count({ where: { account: { userId }, categoryId: null } }),
          prisma.transaction.count({
            where: { account: { userId }, categoryId: { not: null }, payeeId: null },
          }),
          prisma.categorizationRule.count({ where: { userId, isActive: true } }),
        ])

        const dateRange = await prisma.transaction.aggregate({
          where: { account: { userId } },
          _min: { date: true },
          _max: { date: true },
        })

        const snapshot = `Financial database snapshot:
- Total transactions: ${txCount}
- Uncategorised transactions: ${uncatCount}
- Transactions with category but no payee: ${noPayeeCount}
- Active categorisation rules: ${activeRuleCount}
- Date range: ${dateRange._min.date?.toISOString().slice(0, 10) ?? 'n/a'} → ${dateRange._max.date?.toISOString().slice(0, 10) ?? 'n/a'}

Start by calling get_uncategorised_transactions, then get_categories to confirm names.`

        // ── Step 2: pre-load context for in-memory dispatch ───────────────
        send({ type: 'status', message: 'Pre-loading transaction index…' })

        const preloaded = await loadRulesContext(userId)

        const ctx: RulesContext = {
          send,
          ...preloaded,
          coveredThisRun: new Set<string>(),
        }

        // ── Step 3: agentic tool loop ──────────────────────────────────────
        send({ type: 'status', message: 'Ready — starting analysis…' })

        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: snapshot },
        ]

        let finished = false

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await openrouterWithTools(messages, RULES_TOOLS, 'anthropic/claude-sonnet-4-5')

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

          // Execute tool calls
          for (const tc of response.tool_calls) {
            const toolName = tc.function.name
            let args: unknown
            try {
              args = JSON.parse(tc.function.arguments)
            } catch {
              args = {}
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

            if (result === 'FINISH_ANALYSIS') {
              finished = true
              break
            }
          }

          if (finished) break
        }

        // ── Step 4: done ──────────────────────────────────────────────────
        send({ type: 'done', uncategorised: uncatCount, noPayee: noPayeeCount })
      } catch (err) {
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

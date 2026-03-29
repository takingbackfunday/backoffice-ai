import { openrouterChat } from '@/lib/llm/openrouter'
import { prisma } from '@/lib/prisma'
import { FINANCE_TOOLS, dispatchTool } from '@/lib/agent/finance-tools'
import { runToolLoop } from '@/lib/agent/tool-loop'
import { formatHistory } from '@/lib/agent/format-history'
import type { Agent, AgentContext, AgentResult } from '@/lib/agent/types'
import type { ChatMessage } from '@/lib/llm/openrouter'

const ROUTER_MODEL = 'google/gemini-2.0-flash-lite-001'
const AGENT_MODEL = 'anthropic/claude-sonnet-4.6'
const MAX_ROUNDS_SIMPLE = 4
const MAX_ROUNDS_COMPLEX = 8

async function routeQuestion(question: string): Promise<'simple' | 'complex'> {
  const prompt = `You are a router. Classify this finance question as "simple" or "complex".

Simple: single category/account total, recent transactions list, payee lookup, basic balance query.
Complex: multi-period comparisons, "why is X high", trend/anomaly analysis, questions spanning multiple categories or accounts.

Reply with exactly one word: simple or complex.

Question: ${question}`

  try {
    const result = await openrouterChat([{ role: 'user', content: prompt }], ROUTER_MODEL)
    return result.trim().toLowerCase().startsWith('complex') ? 'complex' : 'simple'
  } catch {
    return 'simple'
  }
}

function buildSystemPrompt(snapshot: string, history: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are a personal finance assistant with access to a set of database tools.

Today's date is ${today}. Use this as your reference for relative date expressions like "this month", "last month", "this year", "last 30 days", etc.

${snapshot}

Prior conversation:
${history}

Use the tools to look up whatever data you need to answer the user's question accurately. You can call multiple tools in sequence — for example, call get_categories first to discover exact category names, then aggregate_transactions to get totals.

CRITICAL RULES — follow these exactly:
1. NEVER state a dollar amount you have not directly read from a tool result. No estimates, no sums in your head, no invented figures.
2. For any total/sum, call aggregate_transactions — do NOT compute it yourself from a list of rows.
3. For "why is X high", first call aggregate_transactions with categoryNames filter and date range to get the real total, then call query_transactions to list the individual transactions. Report ONLY what the tools returned.
4. If a category name is unknown, call get_categories first to find the exact name.
5. When asked about a specific time period, always pass dateFrom and dateTo to every tool call.
6. Do not confuse different categories — Bank Fees transactions are NOT the same as tax payments or transfers, even if they appear in the same account.
7. When analysing expenses, spending, income, or revenue, non-deductible categories (transfers, owner draws, etc.) are automatically excluded by the query tools. If the user explicitly asks about transfers or those specific categories, pass them via categoryNames to include them.
8. If you cannot answer using the finance tools and the question is about properties, tenants, or rent — respond with exactly: [NEEDS_PROPERTY_AGENT]

Guidelines:
- Always use the most efficient tool for the job (aggregate_transactions for totals, query_transactions for individual rows)
- When asked about a specific period, always filter by date
- Be specific and data-driven — cite only actual amounts from tool results
- Keep answers concise but complete — bullet points are fine, no markdown headers
- Plain text only, no markdown formatting`
}

async function buildSnapshot(userId: string): Promise<string> {
  const [txCount, accounts, activeRules, nonDeductibleGroups, dateRange] = await Promise.all([
    prisma.transaction.count({ where: { account: { userId } } }),
    prisma.account.findMany({ where: { userId }, select: { name: true, currency: true } }),
    prisma.categorizationRule.count({ where: { userId, isActive: true } }),
    prisma.categoryGroup.findMany({
      where: { userId, taxType: 'non_deductible' },
      select: { name: true, categories: { select: { name: true } } },
    }),
    prisma.transaction.aggregate({
      where: { account: { userId } },
      _min: { date: true },
      _max: { date: true },
    }),
  ])

  const nonDeductibleCategoryNames = nonDeductibleGroups.flatMap(g => g.categories.map(c => c.name))

  return `Financial database snapshot:
- Accounts: ${accounts.map(a => `${a.name} (${a.currency})`).join(', ')}
- Transactions: ${txCount} total
- Date range: ${dateRange._min.date?.toISOString().slice(0, 10) ?? 'n/a'} → ${dateRange._max.date?.toISOString().slice(0, 10) ?? 'n/a'}
- Active rules: ${activeRules}

NON-DEDUCTIBLE CATEGORIES (ALWAYS exclude from revenue/expense/spending analysis unless the user specifically asks about them):
${nonDeductibleCategoryNames.length ? nonDeductibleCategoryNames.map(n => `  - ${n}`).join('\n') : '  (none configured)'}

Use the tools to query any data you need.`
}

export const financeAgent: Agent = {
  domain: 'finance',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const { userId, question, conversationHistory, onStatus } = ctx

    onStatus('Loading your financial overview…')
    const [snapshot, complexity] = await Promise.all([
      buildSnapshot(userId),
      (async () => {
        onStatus('Routing…')
        return routeQuestion(question)
      })(),
    ])

    const maxRounds = complexity === 'complex' ? MAX_ROUNDS_COMPLEX : MAX_ROUNDS_SIMPLE
    const history = formatHistory(conversationHistory)

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(snapshot, history) },
      { role: 'user', content: `Question: ${question}` },
    ]

    onStatus(complexity === 'complex' ? 'Thinking deeply…' : 'Thinking…')

    const { answer, toolsUsed } = await runToolLoop({
      messages,
      tools: FINANCE_TOOLS,
      dispatchTool: (name, args) => dispatchTool(userId, name, args),
      model: AGENT_MODEL,
      maxRounds,
      onStatus,
    })

    const needsHandoff = answer.includes('[NEEDS_PROPERTY_AGENT]')

    return {
      answer: needsHandoff ? '' : answer,
      toolsUsed,
      needsHandoff,
      handoffContext: needsHandoff ? question : undefined,
      domain: 'finance',
    }
  },
}

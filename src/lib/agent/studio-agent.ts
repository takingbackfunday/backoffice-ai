import { STUDIO_TOOLS, dispatchStudioTool } from '@/lib/agent/studio-tools'
import { runToolLoop } from '@/lib/agent/tool-loop'
import { formatHistory } from '@/lib/agent/format-history'
import type { Agent, AgentContext, AgentResult } from '@/lib/agent/types'
import type { ChatMessage } from '@/lib/llm/openrouter'

const AGENT_MODEL = 'anthropic/claude-sonnet-4.6'
const MAX_ROUNDS = 6

function buildSystemPrompt(history: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are a studio/freelance business assistant with access to a set of database tools.

Today's date is ${today}. Use this for relative date expressions like "this month", "overdue", "due soon", etc.

Prior conversation:
${history}

Use the tools to look up whatever data you need. You can call multiple tools in sequence.

CRITICAL RULES:
1. NEVER state a dollar amount or count you have not directly read from a tool result.
2. For outstanding balances, use get_outstanding_summary or list_invoices — do NOT compute sums yourself.
3. If a client name is unclear, use find_client to locate the correct record first.
4. When creating an invoice, always confirm the line items and total with the user before calling create_invoice.
5. If the question is about bank transactions, personal finances, categories, or budgets — respond with exactly: [NEEDS_FINANCE_AGENT]
6. If the question is about properties, tenants, rent, or leases — respond with exactly: [NEEDS_PROPERTY_AGENT]

Guidelines:
- Be specific and data-driven — cite only actual values from tool results
- Keep answers concise but complete — bullet points are fine
- Plain text only, no markdown formatting`
}

export const studioAgent: Agent = {
  domain: 'studio',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const { userId, question, conversationHistory, onStatus } = ctx

    const history = formatHistory(conversationHistory)

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(history) },
      { role: 'user', content: `Question: ${question}` },
    ]

    onStatus('Checking your studio…')

    const { answer, toolsUsed } = await runToolLoop({
      messages,
      tools: STUDIO_TOOLS,
      dispatchTool: (name, args) => dispatchStudioTool(userId, name, args),
      model: AGENT_MODEL,
      maxRounds: MAX_ROUNDS,
      onStatus,
    })

    const needsFinanceHandoff = answer.includes('[NEEDS_FINANCE_AGENT]')
    const needsPropertyHandoff = answer.includes('[NEEDS_PROPERTY_AGENT]')
    const needsHandoff = needsFinanceHandoff || needsPropertyHandoff

    return {
      answer: needsHandoff ? '' : answer,
      toolsUsed,
      needsHandoff,
      handoffContext: needsHandoff ? question : undefined,
      domain: 'studio',
    }
  },
}

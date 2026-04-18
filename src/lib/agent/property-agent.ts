import { PROPERTY_TOOLS, dispatchPropertyTool } from '@/lib/agent/property-tools'
import { runToolLoop } from '@/lib/agent/tool-loop'
import { formatHistory } from '@/lib/agent/format-history'
import type { Agent, AgentContext, AgentResult } from '@/lib/agent/types'
import type { ChatMessage } from '@/lib/llm/openrouter'

const AGENT_MODEL = 'anthropic/claude-sonnet-4.6'
const MAX_ROUNDS = 6

function buildSystemPrompt(history: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are a property management assistant with access to a set of database tools.

Today's date is ${today}. Use this for relative date expressions like "this month", "expiring soon", etc.

Prior conversation:
${history}

Use the tools to look up whatever data you need. You can call multiple tools in sequence.

CRITICAL RULES:
1. NEVER state a dollar amount or count you have not directly read from a tool result.
2. For balance/revenue totals, use get_tenant_balance or get_property_revenue — do NOT compute sums yourself.
3. If a property or tenant name is unclear, use list_properties or get_tenant to find the correct name first.
4. When asked about communication, correspondence, messages, or notes with a tenant — use list_unit_messages. Always check this tool when asked "have we spoken", "any messages", "any communication", or similar.
5. If the question is about finances, bank transactions, categories, or expenses outside the property context — respond with exactly: [NEEDS_FINANCE_AGENT]

Guidelines:
- Be specific and data-driven — cite only actual values from tool results
- Keep answers concise but complete — bullet points are fine
- Plain text only, no markdown formatting`
}

export const propertyAgent: Agent = {
  domain: 'property',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const { userId, question, conversationHistory, onStatus } = ctx

    const history = formatHistory(conversationHistory)

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(history) },
      { role: 'user', content: `Question: ${question}` },
    ]

    onStatus('Checking your properties…')

    const { answer, toolsUsed } = await runToolLoop({
      messages,
      tools: PROPERTY_TOOLS,
      dispatchTool: (name, args) => dispatchPropertyTool(userId, name, args),
      model: AGENT_MODEL,
      maxRounds: MAX_ROUNDS,
      onStatus,
      onToken: ctx.onToken,
    })

    const needsHandoff = answer.includes('[NEEDS_FINANCE_AGENT]')

    return {
      answer: needsHandoff ? '' : answer,
      toolsUsed,
      needsHandoff,
      handoffContext: needsHandoff ? question : undefined,
      domain: 'property',
    }
  },
}

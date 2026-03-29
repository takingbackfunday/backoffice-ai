import { classifyDomain } from '@/lib/agent/domain-classifier'
import { financeAgent } from '@/lib/agent/finance-agent'
import { propertyAgent } from '@/lib/agent/property-agent'
import type { AgentContext, AgentResult, ConversationTurn, SseEvent } from '@/lib/agent/types'

type SendFn = (event: SseEvent) => void

export async function orchestrate(opts: {
  userId: string
  question: string
  conversationHistory: ConversationTurn[]
  send: SendFn
}): Promise<{ answer: string; toolsUsed: string[] }> {
  const { userId, question, conversationHistory, send } = opts

  send({ type: 'status', message: 'Classifying question…' })
  const classification = await classifyDomain(question)
  console.log('[orchestrator] classify', JSON.stringify(classification))

  const ctx: AgentContext = {
    userId,
    question,
    conversationHistory,
    onStatus: (message) => send({ type: 'status', message }),
  }

  // Primary agent run
  const primaryAgent = classification.primary === 'property' ? propertyAgent : financeAgent
  const primaryResult: AgentResult = await primaryAgent.run(ctx)

  // If primary agent signals handoff, run secondary
  if (primaryResult.needsHandoff && classification.secondary) {
    const secondaryAgent = classification.secondary === 'property' ? propertyAgent : financeAgent
    send({ type: 'status', message: `Handing off to ${classification.secondary} agent…` })

    const secondaryCtx: AgentContext = {
      ...ctx,
      question: primaryResult.handoffContext ?? question,
    }
    const secondaryResult: AgentResult = await secondaryAgent.run(secondaryCtx)

    const combined = [primaryResult.answer, secondaryResult.answer].filter(Boolean).join('\n\n')
    return {
      answer: combined || secondaryResult.answer,
      toolsUsed: [...primaryResult.toolsUsed, ...secondaryResult.toolsUsed],
    }
  }

  // If primary needs handoff but no secondary was predicted, try the other agent
  if (primaryResult.needsHandoff) {
    const fallbackAgent = classification.primary === 'property' ? financeAgent : propertyAgent
    send({ type: 'status', message: 'Routing to alternative agent…' })
    const fallbackResult: AgentResult = await fallbackAgent.run(ctx)
    return {
      answer: fallbackResult.answer,
      toolsUsed: [...primaryResult.toolsUsed, ...fallbackResult.toolsUsed],
    }
  }

  return { answer: primaryResult.answer, toolsUsed: primaryResult.toolsUsed }
}

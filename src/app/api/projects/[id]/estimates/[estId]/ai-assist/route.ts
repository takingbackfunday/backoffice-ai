import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { openrouterChat, openrouterWithTools } from '@/lib/llm/openrouter'
import type { ChatMessage, ToolDefinition } from '@/lib/llm/openrouter'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const EstimateItemSchema = z.object({
  description: z.string(),
  hours: z.number().nullable().optional(),
  costRate: z.number().nullable().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isOptional: z.boolean().optional(),
  riskLevel: z.string().optional(),
})

const EstimateSectionSchema = z.object({
  name: z.string(),
  items: z.array(EstimateItemSchema),
})

const CurrentEstimateSchema = z.object({
  title: z.string().optional(),
  currency: z.string().optional(),
  sections: z.array(EstimateSectionSchema).optional(),
})

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  currentEstimate: CurrentEstimateSchema.optional(),
  clientName: z.string().optional(),
  projectDescription: z.string().optional().nullable(),
  billingType: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; estId: string }> }

const ESTIMATE_AI_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_similar_estimates',
      description: 'Look up previous estimates on this project to use as reference for hours and rates.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max number of past estimates to return (default 3)' },
        },
      },
    },
  },
]

function parseEstimateJson(raw: string): { text: string; actions: unknown[] } | null {
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]
  try {
    const parsed = JSON.parse(jsonStr)
    return { text: parsed.text ?? '', actions: parsed.actions ?? [] }
  } catch {
    return null
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, estId } = await params

    const project = await prisma.workspace.findFirst({ where: { id, userId } })
    if (!project) return notFound('Project not found')

    // If estId is a real ID (not 'new'), verify ownership
    if (estId !== 'new') {
      const exists = await prisma.estimate.findFirst({ where: { id: estId, workspaceId: id } })
      if (!exists) return notFound('Estimate not found')
    }

    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      console.error('[ai-assist] validation error:', parsed.error.errors)
      return badRequest(parsed.error.errors[0].message)
    }

    const { messages, currentEstimate, clientName, projectDescription, billingType } = parsed.data

    const currentEstimateStr = currentEstimate?.sections?.length
      ? `Current estimate state:\n${JSON.stringify(currentEstimate, null, 2)}`
      : 'No items in estimate yet.'

    const systemPrompt = `You are an estimation assistant for a freelancer or consultant. Help them build accurate internal project estimates.

Client: ${clientName || 'Unknown'}
Project: ${project.name}${projectDescription ? `\nDescription: ${projectDescription}` : ''}
Billing type: ${billingType || 'Not specified'}

${currentEstimateStr}

You have a tool to look up previous estimates on this project for reference.

Respond with JSON ONLY — no prose outside the JSON object:
{
  "text": "friendly 1-2 sentence response",
  "actions": [
    { "type": "set_sections", "sections": [{ "name": "Section Name", "items": [{ "description": "...", "hours": 8, "costRate": 75, "quantity": 1, "unit": "hrs", "tags": ["dev"], "isOptional": false, "riskLevel": "low" }] }] },
    { "type": "add_section", "name": "Section Name", "items": [{ "description": "...", "hours": 4, "costRate": 75, "unit": "hrs", "tags": ["dev"] }] },
    { "type": "add_items", "sectionName": "Exact Section Name", "items": [{ "description": "...", "hours": 4, "costRate": 75, "unit": "hrs", "tags": ["dev"] }] },
    { "type": "set_title", "title": "..." },
    { "type": "set_notes", "notes": "..." },
    { "type": "ask_clarification", "question": "..." }
  ]
}

Rules:
- costRate = what this work costs internally (subcontractor rate or the user's floor rate); NEVER shown to the client
- NEVER undervalue professional work. Use realistic market rates for the industry/region implied by the client and project:
  - Creative/media production (editing, sound design, directing): £400–£800/day (£50–£100/hr)
  - Consulting, strategy, producing, project management: £400–£700/day (£50–£90/hr)
  - Technical/dev work: £500–£900/day (£65–£110/hr)
  - For well-known broadcasters (BBC, Netflix, etc.) or large brands: lean toward the top of the range
  - If no previous estimates exist and you're unsure of the rate, use £65/hr as a conservative floor — do NOT use rates below £40/hr for professional services
- Use hours × quantity correctly:
  - hours = effort per unit (e.g. hours per episode, hours per day)
  - quantity = number of units (e.g. number of episodes, number of days)
  - unit = label for the quantity unit (e.g. "eps", "days", "sessions")
  - Example: editing 10hrs/episode × 6 episodes → hours: 10, quantity: 6, unit: "eps" (NOT hours: 60, quantity: 1)
  - This lets the client later adjust the episode count without re-estimating
- Group work logically into sections relevant to the project type
- Flag risky/uncertain items with riskLevel: "high"; mark optional scope with isOptional: true
- Tags classify work: "design", "dev", "pm", "consulting", "qa", "production", "post" — these drive margin rules
- For add_items: sectionName must exactly match an existing section name
- For set_sections: replaces all current sections — use only when starting fresh or restructuring
- Always call lookup_similar_estimates first if previous estimates may exist for this project`

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    const MAX_ROUNDS = 3
    for (let round = 0; round < MAX_ROUNDS; round++) {
      console.log(`[ai-assist] round ${round}, messages:`, llmMessages.length)
      const response = await openrouterWithTools(llmMessages, ESTIMATE_AI_TOOLS, 'anthropic/claude-sonnet-4.6')
      console.log(`[ai-assist] round ${round} response: finish_reason=${response.finish_reason}, tool_calls=${response.tool_calls?.length ?? 0}, content=${response.content?.slice(0, 200)}`)

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const text = response.content ?? ''
        console.log('[ai-assist] final content:', text.slice(0, 500))
        const result = parseEstimateJson(text)
        console.log('[ai-assist] parsed result:', result ? `text="${result.text?.slice(0,100)}", actions=${result.actions.length}` : 'null — parse failed')
        return ok(result ?? { text, actions: [] })
      }

      const assistantMsg: Record<string, unknown> = { role: 'assistant' }
      if (response.content) assistantMsg.content = response.content
      assistantMsg.tool_calls = response.tool_calls
      llmMessages.push(assistantMsg as unknown as ChatMessage)

      for (const tc of response.tool_calls) {
        let toolResult: string
        try {
          if (tc.function.name === 'lookup_similar_estimates') {
            const args = JSON.parse(tc.function.arguments) as { limit?: number }
            const previousEstimates = await prisma.estimate.findMany({
              where: { workspaceId: id, id: { not: estId === 'new' ? '' : estId } },
              include: {
                sections: {
                  include: { items: { select: { description: true, hours: true, costRate: true, unit: true, tags: true } } },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: args.limit ?? 3,
            })
            toolResult = previousEstimates.length === 0
              ? 'No previous estimates found for this project.'
              : JSON.stringify(previousEstimates.map(e => ({
                  title: e.title,
                  sections: e.sections.map(s => ({
                    name: s.name,
                    items: s.items.map(i => ({
                      description: i.description,
                      hours: i.hours ? Number(i.hours) : null,
                      costRate: i.costRate ? Number(i.costRate) : null,
                      unit: i.unit,
                      tags: i.tags,
                    })),
                  })),
                })), null, 2)
          } else {
            toolResult = 'Unknown tool'
          }
        } catch {
          toolResult = 'Tool execution failed'
        }

        llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult })
      }
    }

    llmMessages.push({ role: 'user', content: 'Please provide your final response now as the JSON object.' })
    const text = await openrouterChat(
      llmMessages as { role: 'user' | 'assistant' | 'system'; content: string }[],
      'anthropic/claude-sonnet-4.6'
    )
    return ok(parseEstimateJson(text) ?? { text, actions: [] })

  } catch (e) {
    console.error('[estimate ai-assist] unhandled error:', e)
    return serverError()
  }
}

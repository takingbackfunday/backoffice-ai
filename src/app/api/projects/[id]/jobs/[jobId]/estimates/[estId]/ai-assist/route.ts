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
  jobDescription: z.string().optional().nullable(),
  billingType: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; jobId: string; estId: string }> }

// Tools available to the estimate AI
const ESTIMATE_AI_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_similar_estimates',
      description: 'Look up previous estimates on other jobs for this client to use as a reference for hours and rates. Returns section names and item-level hour/rate data.',
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
    const { id, jobId, estId } = await params

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        clientProfile: { workspace: { id, userId } },
      },
      include: { clientProfile: { include: { workspace: true } } },
    })
    if (!job) return notFound('Job not found')

    // If estId is a real ID (not 'new'), verify it belongs to this job
    if (estId !== 'new') {
      const estimateExists = await prisma.estimate.findFirst({ where: { id: estId, jobId } })
      if (!estimateExists) return notFound('Estimate not found')
    }

    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { messages, currentEstimate, clientName, jobDescription, billingType } = parsed.data

    const currentEstimateStr = currentEstimate?.sections?.length
      ? `Current estimate state:\n${JSON.stringify(currentEstimate, null, 2)}`
      : 'No items in estimate yet.'

    const systemPrompt = `You are an estimation assistant for a freelancer or consultant. Help them build accurate internal project estimates.

Client: ${clientName || 'Unknown'}
Job description: ${jobDescription || 'Not specified'}
Billing type: ${billingType || 'Not specified'}

${currentEstimateStr}

You have a tool to look up previous estimates on this client's other jobs for reference.

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
- Be specific about hours and cost rates — internal numbers the freelancer uses for margin calculation
- costRate = what this work costs internally (subcontractor rate or the user's floor rate)
- Group work logically into sections: Discovery, Design, Development, QA, Project Management
- Flag risky/uncertain items with riskLevel: "high"; mark optional scope with isOptional: true
- Tags classify work: "design", "dev", "pm", "consulting", "qa" — these drive margin rules
- For add_items: sectionName must exactly match an existing section name
- For set_sections: replaces all current sections — use only when starting fresh or restructuring
- Never invent rates without reference data — use lookup_similar_estimates or ask
- costRate is NEVER shown to the client`

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    // Tool loop — max 3 rounds
    const MAX_ROUNDS = 3
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await openrouterWithTools(llmMessages, ESTIMATE_AI_TOOLS, 'anthropic/claude-sonnet-4.6')

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const text = response.content ?? ''
        const result = parseEstimateJson(text)
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
            const limit = args.limit ?? 3
            const previousEstimates = await prisma.estimate.findMany({
              where: {
                job: {
                  clientProfile: { workspace: { id, userId } },
                  id: { not: jobId },
                },
              },
              include: {
                sections: {
                  include: { items: { select: { description: true, hours: true, costRate: true, unit: true, tags: true } } },
                },
                job: { select: { name: true } },
              },
              orderBy: { createdAt: 'desc' },
              take: limit,
            })
            if (previousEstimates.length === 0) {
              toolResult = 'No previous estimates found for this client.'
            } else {
              toolResult = JSON.stringify(previousEstimates.map(e => ({
                job: e.job.name,
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
            }
          } else {
            toolResult = 'Unknown tool'
          }
        } catch {
          toolResult = 'Tool execution failed'
        }

        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolResult,
        })
      }
    }

    // Exhausted rounds — force final answer
    llmMessages.push({ role: 'user', content: 'Please provide your final response now as the JSON object.' })
    const text = await openrouterChat(
      llmMessages as { role: 'user' | 'assistant' | 'system'; content: string }[],
      'anthropic/claude-sonnet-4.6'
    )
    const result = parseEstimateJson(text)
    return ok(result ?? { text, actions: [] })

  } catch (e) {
    console.error('[estimate ai-assist]', e)
    return serverError()
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { badRequest, unauthorized, notFound } from '@/lib/api-response'
import { openrouterWithTools, openrouterStream } from '@/lib/llm/openrouter'
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

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

export async function POST(request: Request, { params }: RouteParams) {
  const { userId } = await auth()
  if (!userId) return unauthorized()
  const { id, estId } = await params

  const project = await prisma.workspace.findFirst({ where: { id, userId } })
  if (!project) return notFound('Project not found')

  if (estId !== 'new') {
    const exists = await prisma.estimate.findFirst({ where: { id: estId, workspaceId: id } })
    if (!exists) return notFound('Estimate not found')
  }

  const body = await request.json()
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.errors[0].message)

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

## Field definitions for every line item:
- description: what the work is
- hours: hours of effort PER unit (e.g. 5 hrs per episode, 8 hrs per day) — NOT total hours
- costRate: internal cost per HOUR (subcontractor rate or floor rate) — NEVER shown to client
- quantity: how many units (e.g. 6 episodes, 3 days, 1 fixed fee)
- unit: label for the quantity (e.g. "eps", "days", "sessions", "fixed") — NOT "hrs"
- Line item cost = hours × costRate × quantity

## Examples of correct field usage:
- "Edit 5hrs per episode, 6 episodes at $80/hr" → hours:5, costRate:80, quantity:6, unit:"eps" → cost $2,400
- "Strategy workshop, 1 day at $600/day (7.5hrs)" → hours:7.5, costRate:80, quantity:1, unit:"day" → cost $600
- "Fixed fee deliverable" → hours:1, costRate:<total cost>, quantity:1, unit:"fixed"
- WRONG: hours:30, quantity:1, unit:"hrs" for something repeated 6 times — use hours:5, quantity:6, unit:"eps"

## Actions (respond with JSON ONLY — no prose outside the JSON object):
{
  "text": "friendly 1-2 sentence response",
  "actions": [
    { "type": "set_sections", "sections": [{ "name": "Section Name", "items": [{ "description": "...", "hours": 5, "costRate": 80, "quantity": 6, "unit": "eps", "tags": ["production"], "isOptional": false, "riskLevel": "low" }] }] },
    { "type": "add_section", "name": "Section Name", "items": [{ "description": "...", "hours": 5, "costRate": 80, "quantity": 6, "unit": "eps", "tags": ["production"] }] },
    { "type": "add_items", "sectionName": "Exact Section Name", "items": [{ "description": "...", "hours": 5, "costRate": 80, "quantity": 6, "unit": "eps", "tags": ["production"] }] },
    { "type": "set_title", "title": "..." },
    { "type": "set_notes", "notes": "..." },
    { "type": "ask_clarification", "question": "..." }
  ]
}

## Rules:
- costRate is the hourly cost rate — NEVER shown to the client
- NEVER undervalue professional work. Infer realistic market rates from context clues (industry, client type, region, seniority):
  - Scale rates to the seniority and specialisation implied — a senior specialist commands more than a junior generalist
  - For well-known brands or large institutions: lean toward the higher end of typical market rates for that discipline
  - If genuinely unsure of rate, use ask_clarification to ask the user their day/hour rate before filling in numbers
- unit should describe what quantity counts (eps, days, sessions, rounds) — never "hrs" since hours is already its own field
- Group work into sections relevant to the project type
- Flag risky/uncertain items with riskLevel: "high"; mark genuinely optional scope with isOptional: true
- Tags classify work type: "design", "dev", "pm", "consulting", "qa", "production", "post" — these drive margin rules
- For add_items: sectionName must exactly match an existing section name
- For set_sections: replaces all sections — use only when starting fresh or restructuring
- Always call lookup_similar_estimates first if the project may have prior estimates`

  const llmMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Run tool rounds (non-streaming; estimate tool calls are fast DB lookups)
        const MAX_ROUNDS = 3
        let toolRoundsRan = false

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const response = await openrouterWithTools(llmMessages, ESTIMATE_AI_TOOLS, 'anthropic/claude-sonnet-4.6')

          if (!response.tool_calls || response.tool_calls.length === 0) {
            // No more tools — if we never ran any tools, content is the final answer
            if (!toolRoundsRan && response.content) {
              const result = parseEstimateJson(response.content)
              controller.enqueue(sseEvent({ type: 'done', text: result?.text ?? response.content, actions: result?.actions ?? [] }))
              controller.close()
              return
            }
            break
          }

          toolRoundsRan = true
          controller.enqueue(sseEvent({ type: 'status', text: 'Looking up similar estimates…' }))

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

        // Stream the final answer
        llmMessages.push({ role: 'user', content: 'Please provide your final response now as the JSON object.' })
        let fullText = ''
        await openrouterStream(llmMessages, 'anthropic/claude-sonnet-4.6', (token) => {
          fullText += token
          // Extract and forward just the visible text portion as it streams
          const display = extractStreamingText(fullText)
          if (display) controller.enqueue(sseEvent({ type: 'token', text: display }))
        })
        const result = parseEstimateJson(fullText)
        controller.enqueue(sseEvent({ type: 'done', text: result?.text ?? fullText, actions: result?.actions ?? [] }))
        controller.close()
      } catch (err) {
        console.error('[estimate ai-assist]', err)
        controller.enqueue(sseEvent({ type: 'error', text: 'Failed to get AI response' }))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

/** Extract the visible text value from a partially-streamed JSON response.
 *  Char-by-char walk so embedded quotes and escape sequences are handled correctly. */
function extractStreamingText(raw: string): string {
  const textKeyIdx = raw.indexOf('"text"')
  if (textKeyIdx === -1) return ''
  const colonIdx = raw.indexOf(':', textKeyIdx + 6)
  if (colonIdx === -1) return ''

  let i = colonIdx + 1
  while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) i++
  if (i >= raw.length || raw[i] !== '"') return ''
  i++

  let result = ''
  while (i < raw.length) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      const esc = raw[i + 1]
      if (esc === '"') result += '"'
      else if (esc === 'n') result += '\n'
      else if (esc === 't') result += '\t'
      else if (esc === '\\') result += '\\'
      else result += esc
      i += 2
    } else if (raw[i] === '"') {
      break
    } else {
      result += raw[i]
      i++
    }
  }
  return result
}

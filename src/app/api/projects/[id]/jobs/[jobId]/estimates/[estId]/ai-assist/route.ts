import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { openrouterChat } from '@/lib/llm/openrouter'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  clientName: z.string().optional(),
  jobDescription: z.string().optional().nullable(),
  billingType: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; jobId: string; estId: string }> }

function parseEstimateJson(raw: string): { text: string; actions: unknown[] } | null {
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]
  try {
    return JSON.parse(jsonStr)
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
    })
    if (!job) return notFound('Job not found')

    // If estId is a real ID (not 'new'), verify the estimate belongs to this job
    if (estId !== 'new') {
      const estimateExists = await prisma.estimate.findFirst({
        where: { id: estId, jobId },
      })
      if (!estimateExists) return notFound('Estimate not found')
    }

    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { messages, clientName, jobDescription, billingType } = parsed.data

    const systemPrompt = `You are an estimation assistant for a freelancer or consultant. Help them build an accurate internal project estimate.

Client: ${clientName || 'Unknown'}
Job: ${jobDescription || 'Not specified'}
Billing type: ${billingType || 'Not specified'}

Return ONLY valid JSON with this structure:
{
  "text": "your conversational response",
  "actions": [
    // One or more of these action types:
    { "type": "set_sections", "sections": [{ "name": "Section Name", "items": [{ "description": "...", "hours": 8, "costRate": 75, "quantity": 1, "unit": "hrs", "tags": ["dev"], "isOptional": false }] }] },
    { "type": "add_section", "name": "Section Name" },
    { "type": "add_items", "sectionName": "Section Name", "items": [{ "description": "...", "hours": 4, "costRate": 75 }] },
    { "type": "set_title", "title": "..." },
    { "type": "set_notes", "notes": "..." },
    { "type": "ask_clarification", "question": "..." }
  ]
}

Guidelines:
- Be specific about hours and cost rates — these are internal numbers the freelancer will use for margin calculation
- Hours represent effort; costRate is what this work costs internally (subcontractor rate or the user's floor rate)
- Group work logically into sections (e.g. Discovery, Design, Development, QA, Project Management)
- Flag risky or uncertain items with riskLevel: "high"
- Mark items that might be optional with isOptional: true
- Use tags to classify work: "design", "dev", "pm", "consulting", "qa"
- Never expose internal costs to the client — this is purely internal`

    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    const raw = await openrouterChat(llmMessages, 'anthropic/claude-sonnet-4.6')
    const result = parseEstimateJson(raw)

    if (!result) {
      return ok({ text: raw, actions: [] })
    }

    return ok(result)
  } catch (e) {
    console.error('[estimate ai-assist]', e)
    return serverError()
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { openrouterChat } from '@/lib/llm/openrouter'
import { logger } from '@/lib/log'

const RequestSchema = z.object({
  currentInvoice: z.object({
    lineItems: z.array(z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
    })),
    tax: z.object({ label: z.string(), amount: z.number() }).nullable().optional(),
    dueDate: z.string().optional(),
    currency: z.string().optional(),
    notes: z.string().optional(),
    subtotal: z.number().optional(),
    total: z.number().optional(),
  }),
  clientName: z.string().optional(),
  company: z.string().nullable().optional(),
  paymentTermDays: z.number().optional(),
  billingType: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!project) return notFound('Project not found')

    const body = await request.json()
    logger.info('ai-finalize', 'request', { bodyKeys: Object.keys(body) })
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      logger.error('ai-finalize', 'validation failed', { errors: parsed.error.errors })
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    const { currentInvoice, clientName, company, paymentTermDays, billingType } = parsed.data
    logger.info('ai-finalize', 'calling LLM', { projectId: id, total: currentInvoice.total })

    const systemPrompt = `Review this invoice for a ${billingType ?? 'freelance'} professional.

Invoice summary:
${JSON.stringify(currentInvoice, null, 2)}

Client: ${clientName ?? 'the client'}${company ? ` (${company})` : ''}. Payment terms: ${paymentTermDays ?? 30} days net.

Return JSON ONLY:
{
  "suggestedNotes": "complete payment terms paragraph, or null if the notes already look good",
  "questions": ["clarifying question if something seems off, or empty array"]
}

Notes guidance: cover payment method preference, late fee policy if appropriate (e.g. 1.5%/month after due date), and a brief thank-you line. Professional but warm. Max 4 sentences. Return null if existing notes are already thorough.

Questions: ask only if something seems genuinely unclear or missing (e.g. no due date set, zero-amount line items, currency mismatch).`

    const raw = await openrouterChat(
      [{ role: 'user', content: systemPrompt }],
      'anthropic/claude-sonnet-4.6'
    )
    logger.info('ai-finalize', 'raw LLM response', { preview: raw.slice(0, 300) })

    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (braceMatch) jsonStr = braceMatch[0]

    let result: { suggestedNotes: string | null; questions: string[] }
    try {
      result = JSON.parse(jsonStr)
      logger.info('ai-finalize', 'parsed ok', { hasNotes: !!result.suggestedNotes, questionsCount: result.questions?.length ?? 0 })
    } catch (parseErr) {
      logger.error('ai-finalize', 'JSON parse failed', { preview: jsonStr.slice(0, 200) })
      return ok({ suggestedNotes: null, questions: [] })
    }

    return ok({
      suggestedNotes: result.suggestedNotes ?? null,
      questions: Array.isArray(result.questions) ? result.questions : [],
    })
  } catch (err) {
    logger.error('ai-finalize', 'unhandled error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to finalize invoice')
  }
}

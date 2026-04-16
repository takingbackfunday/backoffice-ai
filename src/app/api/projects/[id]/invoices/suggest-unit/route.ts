import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { openrouterChat } from '@/lib/llm/openrouter'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'

const Schema = z.object({
  description: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) return badRequest('description is required')

    const { description } = parsed.data

    const reply = await openrouterChat([
      {
        role: 'system',
        content: `You are a billing assistant. Given a line item description, respond with JSON only: {"unit":"<label>","confidence":"high"|"low"}.
- unit: the best short label (2-8 chars) for the quantity — e.g. "hours", "days", "weeks", "months", "pages", "words", "units", "calls", "sessions", "revisions", "assets", "flat fee".
- confidence: "high" only when the description clearly implies a specific unit (e.g. "design hours" → hours, "monthly retainer" → months). Use "low" when the unit is ambiguous or the description is too vague.
Respond with raw JSON only, no markdown.`,
      },
      {
        role: 'user',
        content: description,
      },
    ], 'mistralai/mistral-small-2603')

    let unit: string | null = null
    let confidence: 'high' | 'low' = 'low'
    try {
      const parsed = JSON.parse(reply.trim())
      unit = typeof parsed.unit === 'string' ? parsed.unit.trim().slice(0, 10).toLowerCase() : null
      confidence = parsed.confidence === 'high' ? 'high' : 'low'
    } catch {
      // malformed response — treat as no suggestion
    }

    if (!unit || confidence !== 'high') return ok({ unit: null, confidence: 'low' })
    return ok({ unit, confidence })
  } catch {
    return serverError('Failed to suggest unit')
  }
}

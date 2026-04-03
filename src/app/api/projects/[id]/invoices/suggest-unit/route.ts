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
        content: 'You are a billing assistant. Given a line item description, respond with only the best short unit label (2-6 chars) for its quantity — e.g. "hrs", "days", "wks", "pages", "words", "units", "calls", "imgs". Respond with just the unit string, nothing else.',
      },
      {
        role: 'user',
        content: description,
      },
    ])

    const unit = reply.trim().slice(0, 10).toLowerCase()
    return ok({ unit })
  } catch {
    return serverError('Failed to suggest unit')
  }
}

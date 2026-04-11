import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { openrouterChat } from '@/lib/llm/openrouter'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'

const BodySchema = z.object({
  description: z.string(),
  payeeName: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      groupName: z.string(),
    })
  ),
})

const SYSTEM_PROMPT = `You are a financial transaction categoriser. Given a transaction description, payee name, and amount, rank the provided category list by how well each matches the transaction.

Return ONLY a JSON array (no markdown, no prose) where each element is:
{ "id": "<category id>", "confidence": <0.0–1.0> }

Include only categories with confidence > 0.05. Sort descending by confidence.
If nothing is relevant, return an empty array [].`

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { description, payeeName, amount, categories } = parsed.data

    if (categories.length === 0) return ok({ suggestions: [] })

    const catList = categories
      .map((c) => `  { "id": "${c.id}", "name": "${c.name}", "group": "${c.groupName}" }`)
      .join('\n')

    const userMsg = [
      `Description: ${description}`,
      payeeName ? `Payee: ${payeeName}` : null,
      amount != null ? `Amount: ${amount}` : null,
      '',
      'Categories to rank:',
      catList,
    ]
      .filter((l) => l !== null)
      .join('\n')

    const raw = await openrouterChat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      'mistralai/mistral-small-2603'
    )

    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (arrayMatch) jsonStr = arrayMatch[0]

    let scored: { id: string; confidence: number }[] = []
    try {
      scored = JSON.parse(jsonStr)
    } catch {
      // Model returned unparseable output — return empty, dropdown still works
      return ok({ suggestions: [] })
    }

    // Merge back name/groupName for the client
    const catMap = new Map(categories.map((c) => [c.id, c]))
    const suggestions = scored
      .filter((s) => catMap.has(s.id) && typeof s.confidence === 'number')
      .map((s) => ({ ...catMap.get(s.id)!, confidence: Math.min(1, Math.max(0, s.confidence)) }))
      .sort((a, b) => b.confidence - a.confidence)

    return ok({ suggestions })
  } catch (err) {
    console.error('[/api/llm/suggest-category]', err)
    return serverError()
  }
}

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { openrouterChat } from '@/lib/llm/openrouter'
import { StarterTemplateSchema } from '@/lib/quote-template-schemas'
import { parsePreferences } from '@/types/preferences'
import { logger } from '@/lib/log'

const BodySchema = z.object({
  description: z.string().trim().min(10).max(2000),
})

const SYSTEM_PROMPT = (workDescription: string | null) =>
  `You generate exactly one detailed quote template for a specific project or job.

The person's general line of work: ${workDescription ?? '(not specified)'}

Context from their work profile: use this to understand their industry and the kind of rates, units, and sections that make sense for them.

Return ONLY valid JSON — no markdown, no code fences, no prose before or after:
{"template": {"name": "...", "sections": [...]}}

Rules:
- "name" is a concise, client-facing title for this project
- "sections" contains 2-4 sections, each with {"name", "items": [...]}
- Each item: {"description", "unit", "quantity", "rate", "costRate", "tags", "isOptional"}
- "unit" is 'hr', 'day', or 'x'
- "quantity" and "rate" are positive numbers
- "costRate" is the internal cost (0 if unknown)
- "tags" are short keywords for margin-rule matching
- "isOptional" should be true for add-ons or upgrades
- Make items specific to the described project — use realistic quantities and rates`

export const POST = authedRoute<void, z.infer<typeof BodySchema>>({
  bodySchema: BodySchema,
  handler: async ({ userId, body }) => {
    const pref = await prisma.userPreference.findUnique({ where: { userId } })
    const workDescription = pref ? parsePreferences(pref.data).workDescription ?? null : null

    let raw: string
    try {
      raw = await openrouterChat(
        [
          { role: 'system', content: SYSTEM_PROMPT(workDescription) },
          { role: 'user', content: `${body.description}

Now generate the JSON template for this specific project. Remember — valid JSON only, no markdown, no prose.` },
        ],
        'mistralai/mistral-small-2603',
        12000,
      )
    } catch (err) {
      logger.error('quote-templates-generate', 'LLM call failed', {
        message: err instanceof Error ? err.message : String(err),
      })
      return badRequest('We couldn\u2019t generate a template from that description \u2014 try adding a bit more detail.')
    }

    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objMatch) jsonStr = objMatch[0]

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      const tryRepair = (s: string): string | null => {
        const firstBrace = s.indexOf('{')
        const lastBrace = s.lastIndexOf('}')
        if (firstBrace === -1 || lastBrace === -1) return null
        s = s.slice(firstBrace, lastBrace + 1)
        s = s.replace(/,(\s*[}\]])/g, '$1')
        s = s.replace(/(["\d])\s*\n\s*(?=["\d{])/g, '$1,')
        s = s.replace(/}\s*{/g, '},{')
        return s
      }
      const repaired = tryRepair(jsonStr)
      if (repaired) {
        try { parsed = JSON.parse(repaired) } catch { /* fall through */ }
      }
      if (parsed === undefined) {
        const snippet = jsonStr.slice(0, 500)
        logger.error('quote-templates-generate', 'JSON parse failed', { raw: raw.slice(0, 500) })
        return badRequest(`The AI returned invalid JSON. Try rephrasing your description.\n${snippet}`)
      }
    }

    const SingleTemplateSchema = z.object({
      template: StarterTemplateSchema,
    })

    const result = SingleTemplateSchema.safeParse(parsed)
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      logger.error('quote-templates-generate', 'Schema validation failed', {
        errors: result.error.issues.map(i => i.message),
      })
      return badRequest(`The AI output didn\u2019t match the expected format (${issues}). Try rephrasing your description.`)
    }

    const createdTemplate = await prisma.quoteTemplate.create({
      data: {
        userId,
        name: result.data.template.name,
        sections: result.data.template.sections,
      },
    })

    return created({
      id: createdTemplate.id,
      name: createdTemplate.name,
      sections: createdTemplate.sections,
    })
  },
})

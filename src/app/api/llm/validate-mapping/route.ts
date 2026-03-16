import { z } from 'zod'
import { openrouterChat } from '@/lib/llm/openrouter'
import { ok, serverError } from '@/lib/api-response'

const BodySchema = z.object({
  headers: z.array(z.string()),
  sampleRows: z.array(z.record(z.string())),
  mapping: z.object({
    dateCol: z.string().optional(),
    amountCol: z.string().optional(),
    descCol: z.string().optional(),
    notesCol: z.string().optional(),
    dateFormat: z.string().optional(),
    amountSign: z.string().optional(),
  }),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return serverError('Invalid request body')
    }

    const { headers, sampleRows, mapping } = parsed.data
    const first20 = sampleRows.slice(0, 20)

    const prompt = `You are a bank CSV expert. Given column headers and sample rows from a bank CSV, validate whether the proposed column mapping is correct.

Headers: ${JSON.stringify(headers)}
Sample rows (${first20.length} rows shown as JSON array): ${JSON.stringify(first20)}

Proposed mapping:
  date column: ${mapping.dateCol ? JSON.stringify(mapping.dateCol) : 'null'}
  amount column: ${mapping.amountCol ? JSON.stringify(mapping.amountCol) : 'null'}
  description column: ${mapping.descCol ? JSON.stringify(mapping.descCol) : 'null'}
  notes column: ${mapping.notesCol ? JSON.stringify(mapping.notesCol) : 'null'}

Respond with ONLY a JSON object — no markdown, no explanation:
{
  "dateCol":   { "col": "<column name or null>", "confidence": <0-100>, "reason": "<one sentence>" },
  "amountCol": { "col": "<column name or null>", "confidence": <0-100>, "reason": "<one sentence>" },
  "descCol":   { "col": "<column name or null>", "confidence": <0-100>, "reason": "<one sentence>" },
  "notesCol":  { "col": "<column name or null>", "confidence": <0-100>, "reason": "<one sentence>" }
}

If a mapping looks correct, echo the same column with high confidence (80-100).
If you think a different column is better, set col to your suggestion with lower confidence.
If a field is not present in the CSV (e.g. no notes column), set col to null.`

    const raw = await openrouterChat([{ role: 'user', content: prompt }])

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const result = JSON.parse(cleaned)

    return ok(result)
  } catch (err) {
    console.error('[/api/llm/validate-mapping]', err)
    return serverError()
  }
}

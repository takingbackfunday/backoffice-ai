import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { openrouterChat } from '@/lib/llm/openrouter'
import { ok, unauthorized, serverError } from '@/lib/api-response'

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
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return serverError('Invalid request body')
    }

    const { headers, sampleRows, mapping } = parsed.data
    const first20 = sampleRows.slice(0, 20)

    // Extract sample values from the detected date and amount columns for format inference
    const dateColName = mapping.dateCol
    const amountColName = mapping.amountCol
    const sampleDates = dateColName ? first20.map((r) => r[dateColName]).filter(Boolean).slice(0, 5) : []
    const sampleAmounts = amountColName ? first20.map((r) => r[amountColName]).filter(Boolean).slice(0, 5) : []

    const prompt = `You are a bank CSV expert. Given column headers and sample rows from a bank CSV, validate the column mapping AND detect the date format and amount sign convention.

Headers: ${JSON.stringify(headers)}
Sample rows (${first20.length} rows shown as JSON array): ${JSON.stringify(first20)}

Proposed mapping:
  date column: ${mapping.dateCol ? JSON.stringify(mapping.dateCol) : 'null'}
  amount column: ${mapping.amountCol ? JSON.stringify(mapping.amountCol) : 'null'}
  description column: ${mapping.descCol ? JSON.stringify(mapping.descCol) : 'null'}
  notes column: ${mapping.notesCol ? JSON.stringify(mapping.notesCol) : 'null'}
  date format: ${mapping.dateFormat ?? 'unknown'}
  amount sign: ${mapping.amountSign ?? 'unknown'}

Sample date values: ${JSON.stringify(sampleDates)}
Sample amount values: ${JSON.stringify(sampleAmounts)}

Respond with ONLY a JSON object — no markdown, no explanation:
{
  "dateCol":    { "col": "<column name or null>", "confidence": <0-100>, "reason": "<one sentence>" },
  "amountCol":  { "col": "<column name or null>", "confidence": <0-100>, "reason": "<one sentence>" },
  "descCol":    { "col": "<column name or null>", "confidence": <0-100>, "reason": "<one sentence>" },
  "notesCol":   { "col": "<column name or null>", "confidence": <0-100>, "reason": "<one sentence>" },
  "dateFormat": { "value": "<MM/DD/YYYY or DD/MM/YYYY or YYYY-MM-DD>", "confidence": <0-100>, "reason": "<one sentence>" },
  "amountSign": { "value": "<normal or inverted>", "confidence": <0-100>, "reason": "<one sentence>" }
}

Rules:
- For column fields: if correct echo the same column with confidence 80-100; if wrong suggest a better one with lower confidence; if absent set col to null.
- For dateFormat: inspect the sample date values. "normal" date formats: MM/DD/YYYY (e.g. 12/31/2024), DD/MM/YYYY (e.g. 31/12/2024), YYYY-MM-DD (e.g. 2024-12-31). Pick the best match.
- For amountSign: "normal" means expenses are negative (e.g. -45.00), "inverted" means expenses are positive (e.g. 45.00 for a debit). Look at the sample amounts — if typical purchases/debits appear as positive numbers, use "inverted".`

    const raw = await openrouterChat([{ role: 'user', content: prompt }], 'mistralai/mistral-small-2603')

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const result = JSON.parse(cleaned)

    return ok(result)
  } catch (err) {
    console.error('[/api/llm/validate-mapping]', err)
    return serverError()
  }
}

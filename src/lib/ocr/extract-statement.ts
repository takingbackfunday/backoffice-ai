import { openrouterChat } from '@/lib/llm/openrouter'

export interface StatementRow {
  date: string // ISO date string YYYY-MM-DD
  description: string
  amount: number // signed: money out negative, money in positive
  notes: string | null
}

/**
 * CSV headers for the synthesized statement CSV. The date header intentionally
 * contains "yyyy" so the column mapper's guessMapping() picks the YYYY-MM-DD
 * date format deterministically.
 */
export const STATEMENT_CSV_HEADERS = ['Date (YYYY-MM-DD)', 'Description', 'Amount', 'Notes']

const SYSTEM_PROMPT = `You are a bank statement parser. You receive OCR markdown of a bank or credit card statement and extract every transaction.

Respond with JSON ONLY — no markdown fences, no prose, no explanation. Just the raw JSON object.

Schema:
{
  "transactions": [
    { "date": "YYYY-MM-DD", "description": string, "amount": number, "notes": string | null }
  ]
}

Rules:
- Include EVERY transaction row from the statement. Skip page headers/footers, account summaries, totals, and opening/closing balance lines.
- "amount" is signed: money leaving the account (purchases, fees, withdrawals) is NEGATIVE; money coming in (deposits, refunds, interest, payments received toward a card balance) is POSITIVE.
- Amounts are plain numbers with a dot decimal separator (e.g. -12.50). No currency symbols, no thousands separators.
- "date" must be YYYY-MM-DD. If the year is missing from a row, infer it from the statement period.
- "description" is the payee or narrative, cleaned of reference codes. Put reference numbers, card digits, or extra detail in "notes" (or null if none).
- If a statement row shows separate debit/credit columns, combine them into the single signed "amount".`

/**
 * Thrown when the LLM response cannot be parsed into a transactions payload
 * (malformed/truncated JSON, or `transactions` missing). Distinct from a valid
 * response that simply contains no transactions, which returns [].
 */
export class StatementParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StatementParseError'
  }
}

/**
 * Parse the LLM response into validated statement rows.
 * Throws StatementParseError on malformed LLM output; returns [] when the
 * response is valid JSON but contains no usable transactions.
 */
export function parseStatementRows(raw: string): StatementRow[] {
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]

  let parsed: { transactions?: unknown }
  try {
    parsed = JSON.parse(jsonStr) as { transactions?: unknown }
  } catch {
    console.error('[extract-statement:parse-error]', { raw: raw.slice(0, 500) })
    throw new StatementParseError(
      'The statement was read, but the extracted transaction data was malformed (possibly truncated). Please try again — or use a CSV export instead.'
    )
  }

  if (!Array.isArray(parsed.transactions)) {
    console.error('[extract-statement:no-transactions-array]', { raw: raw.slice(0, 500) })
    throw new StatementParseError(
      'The statement was read, but the extracted data had an unexpected shape. Please try again — or use a CSV export instead.'
    )
  }

  const rows: StatementRow[] = []
  for (const t of parsed.transactions) {
    if (typeof t !== 'object' || t === null) continue
    const row = t as Record<string, unknown>

    const date = typeof row.date === 'string' ? row.date.trim() : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const description = typeof row.description === 'string' ? row.description.trim() : ''
    if (!description) continue

    const amount = typeof row.amount === 'number' ? row.amount : Number(row.amount)
    if (!Number.isFinite(amount)) continue

    const notes = typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim() : null

    rows.push({ date, description, amount, notes })
  }

  return rows
}

/**
 * Takes OCR markdown from a bank statement PDF and extracts transaction rows via LLM.
 */
export async function extractStatementRows(ocrMarkdown: string): Promise<StatementRow[]> {
  const raw = await openrouterChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: ocrMarkdown },
    ],
    'anthropic/claude-sonnet-4.6',
    16384
  )

  return parseStatementRows(raw)
}

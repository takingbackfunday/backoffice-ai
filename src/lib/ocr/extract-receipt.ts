import { openrouterChat, openrouterImageChat } from '@/lib/llm/openrouter'

export interface ReceiptLineItem {
  name: string
  quantity: number | null
  unitPrice: number | null
  totalPrice: number | null
}

export interface ExtractedReceiptData {
  vendor: string | null
  vendorAddress: string | null
  date: string | null // ISO date string YYYY-MM-DD
  currency: string | null // ISO 4217
  subtotal: number | null
  tax: number | null
  tip: number | null
  total: number | null
  paymentMethod: string | null // "cash", "visa", "mastercard", etc.
  items: ReceiptLineItem[]
  rawCategory: string | null // best-guess: "groceries", "dining", "transport", etc.
}

const RECEIPT_MODEL = 'anthropic/claude-sonnet-4.6'

const SYSTEM_PROMPT = `You are a receipt data extractor. You receive a receipt image or OCR text from a receipt and extract structured data.

Respond with JSON ONLY — no markdown fences, no prose, no explanation. Just the raw JSON object.

Schema:
{
  "vendor": string | null,
  "vendorAddress": string | null,
  "date": "YYYY-MM-DD" | null,
  "currency": "USD" | "EUR" | "GBP" | etc. | null,
  "subtotal": number | null,
  "tax": number | null,
  "tip": number | null,
  "total": number | null,
  "paymentMethod": "cash" | "visa" | "mastercard" | "amex" | "debit" | "apple_pay" | "google_pay" | null,
  "items": [{ "name": string, "quantity": number | null, "unitPrice": number | null, "totalPrice": number | null }],
  "rawCategory": "groceries" | "dining" | "transport" | "fuel" | "office_supplies" | "utilities" | "medical" | "entertainment" | "clothing" | "hardware" | "electronics" | "subscription" | "other" | null
}

Rules:
- All monetary values as plain numbers (no currency symbols). Use the minor unit shown on the receipt (e.g., 12.50 not 1250).
- If a field is not present or unreadable, use null. Never guess.
- "date" must be YYYY-MM-DD format. If the year is missing, assume the current year.
- "items" can be empty array if line items are not visible.
- "rawCategory" is your best guess at the spending category based on vendor name and items.`

function emptyReceiptData(): ExtractedReceiptData {
  return {
    vendor: null,
    vendorAddress: null,
    date: null,
    currency: null,
    subtotal: null,
    tax: null,
    tip: null,
    total: null,
    paymentMethod: null,
    items: [],
    rawCategory: null,
  }
}

function parseReceiptData(raw: string): ExtractedReceiptData {
  // Same parsing strategy as invoice AI routes
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]

  try {
    return JSON.parse(jsonStr) as ExtractedReceiptData
  } catch {
    console.error('[extract-receipt:parse-error]', { raw: raw.slice(0, 500) })
    // Return empty structure — don't throw. The source image/text is still saved.
    return emptyReceiptData()
  }
}

/**
 * Takes OCR markdown from a receipt and extracts structured data via LLM.
 * Retained for retries of receipts processed before image-first extraction.
 */
export async function extractReceiptData(
  ocrMarkdown: string
): Promise<ExtractedReceiptData> {
  const raw = await openrouterChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: ocrMarkdown },
    ],
    RECEIPT_MODEL
  )

  return parseReceiptData(raw)
}

/**
 * Extract receipt data directly from an image (data URI or public URL) via an
 * OpenRouter vision model. Combines OCR and structured extraction in one call,
 * so receipt processing no longer depends on the application's Mistral key.
 */
export async function extractReceiptDataFromImage(
  imageUrl: string
): Promise<ExtractedReceiptData> {
  const { content } = await openrouterImageChat(SYSTEM_PROMPT, imageUrl, {
    model: RECEIPT_MODEL,
    maxTokens: 4096,
    responseFormat: { type: 'json_object' },
  })

  return parseReceiptData(content)
}

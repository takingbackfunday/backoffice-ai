import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import Papa from 'papaparse'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { mistralOcrPdf } from '@/lib/ocr/mistral'
import { extractStatementRows, STATEMENT_CSV_HEADERS, STATEMENT_MODEL } from '@/lib/ocr/extract-statement'
import { logger } from '@/lib/log'
import { checkDailyBudget, recordAgentUsage } from '@/lib/agent/usage'
import { decodePdfDataUri } from '@/lib/ocr/pdf-data-uri'

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const PdfUploadSchema = z.object({
  /** Full data URI: "data:application/pdf;base64,JVBERi0..." */
  pdf: z.string().min(1),
})

/**
 * POST /api/upload/pdf
 * Converts a bank statement PDF into CSV text (via Mistral OCR + LLM extraction)
 * so it can flow through the standard CSV column-mapping / preview / import pipeline.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const budget = await checkDailyBudget(userId)
    if (!budget.ok) {
      return NextResponse.json(
        { data: null, error: 'Daily AI usage limit reached — try again tomorrow, or upload a CSV export instead.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const parsed = PdfUploadSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { pdf } = parsed.data

    // ── Validate PDF data URI and magic bytes ───────────────────────────────
    const decoded = decodePdfDataUri(pdf)
    if (!decoded) return badRequest('This file is not a valid PDF.')
    const pdfBuffer = decoded.buffer
    if (pdfBuffer.length > MAX_PDF_SIZE_BYTES) {
      return badRequest(
        `PDF too large: ${Math.round(pdfBuffer.length / 1024)}KB exceeds 10MB limit`
      )
    }

    // ── OCR → LLM extraction → CSV ────────────────────────────────────────
    const t0 = Date.now()
    const ocr = await mistralOcrPdf(decoded.dataUri)
    const rows = await extractStatementRows(ocr.markdown)

    if (rows.length === 0) {
      return badRequest(
        'No transactions found in this PDF. Make sure it is a bank or card statement — or try a CSV export instead.'
      )
    }

    const csvText = Papa.unparse({
      fields: [...STATEMENT_CSV_HEADERS],
      data: rows.map((r) => [r.date, r.description, r.amount, r.notes ?? '']),
    })

    // Estimated (chars/4) — openrouterChat does not return usage.
    await recordAgentUsage({
      userId,
      endpoint: 'upload-pdf',
      model: STATEMENT_MODEL,
      inputTokens: Math.ceil(ocr.markdown.length / 4),
      outputTokens: Math.ceil(csvText.length / 4),
      toolRounds: 0,
      durationMs: Date.now() - t0,
    })

    return ok(
      { headers: STATEMENT_CSV_HEADERS, csvText },
      { rowCount: rows.length, pagesProcessed: ocr.pagesProcessed }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('pdf-upload', 'POST error', { message })
    return serverError(`Failed to extract transactions from PDF: ${message}`)
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import Papa from 'papaparse'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { mistralOcrPdf } from '@/lib/ocr/mistral'
import { extractStatementRows, STATEMENT_CSV_HEADERS } from '@/lib/ocr/extract-statement'
import { logger } from '@/lib/log'

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const PdfUploadSchema = z.object({
  /** Full data URI: "data:application/pdf;base64,JVBERi0..." */
  pdf: z.string().min(100),
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

    const body = await request.json()
    const parsed = PdfUploadSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { pdf } = parsed.data

    // ── Validate data URI format ──────────────────────────────────────────
    const dataUriMatch = pdf.match(/^data:application\/pdf;base64,(.+)$/)
    if (!dataUriMatch) return badRequest('Invalid PDF data URI format')

    const pdfBuffer = Buffer.from(dataUriMatch[1], 'base64')
    if (pdfBuffer.length > MAX_PDF_SIZE_BYTES) {
      return badRequest(
        `PDF too large: ${Math.round(pdfBuffer.length / 1024)}KB exceeds 10MB limit`
      )
    }

    // ── OCR → LLM extraction → CSV ────────────────────────────────────────
    const ocr = await mistralOcrPdf(pdf)
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

    return ok(
      { headers: STATEMENT_CSV_HEADERS, csvText },
      { rowCount: rows.length, pagesProcessed: ocr.pagesProcessed }
    )
  } catch (err) {
    logger.error('pdf-upload', 'POST error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to extract transactions from PDF')
  }
}

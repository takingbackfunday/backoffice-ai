import { auth } from '@clerk/nextjs/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { extractReceiptData, extractReceiptDataFromImage } from '@/lib/ocr/extract-receipt'
import { classifyReceiptPipelineError, receiptFailureResponseMessage, type ReceiptPipelineStage } from '@/lib/ocr/receipt-failure'
import { logger } from '@/lib/log'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId },
    })
    if (!receipt) return notFound('Receipt not found')
    if (receipt.status !== 'FAILED') return badRequest('Only failed receipts can be retried')
    if (!receipt.thumbnailUrl)
      return badRequest('No image available for retry — please re-upload')

    await prisma.receipt.update({ where: { id }, data: { status: 'PROCESSING' } })
    const stage: ReceiptPipelineStage = 'extract'
    const ocrMarkdown = receipt.ocrMarkdown ?? ''
    let extractedData: Record<string, unknown> = {}

    try {
      // Skip extraction only when a previous attempt stored real receipt data.
      // Failed attempts persist a `{ failure }` marker, which is not usable.
      const stored = receipt.extractedData as Record<string, unknown> | null
      const hasStoredData = Boolean(stored && typeof stored === 'object' && !('failure' in stored))

      if (hasStoredData) {
        extractedData = stored as Record<string, unknown>
      } else if (ocrMarkdown) {
        // Legacy retries: reuse OCR text captured before the image-first flow.
        const extracted = await extractReceiptData(ocrMarkdown)
        extractedData = extracted as unknown as Record<string, unknown>
      } else {
        // Current flow: OCR and extraction happen together in the vision model.
        const extracted = await extractReceiptDataFromImage(receipt.thumbnailUrl)
        extractedData = extracted as unknown as Record<string, unknown>
      }

      const updated = await prisma.receipt.update({
        where: { id },
        data: {
          status: 'NEEDS_REVIEW',
          ocrMarkdown: ocrMarkdown || null,
          extractedData: JSON.parse(JSON.stringify(extractedData)) as Prisma.InputJsonValue,
        },
      })

      return ok(updated)
    } catch (err) {
      const failure = classifyReceiptPipelineError(stage, err)
      await prisma.receipt.update({
        where: { id },
        data: {
          status: 'FAILED',
          ocrMarkdown: ocrMarkdown || receipt.ocrMarkdown || null,
          extractedData: Object.keys(extractedData).length > 0
            ? (JSON.parse(JSON.stringify(extractedData)) as Prisma.InputJsonValue)
            : (JSON.parse(JSON.stringify({ failure })) as Prisma.InputJsonValue),
        },
      })
      logger.error('receipt-retry', 'error', { receiptId: id, ...failure, cause: err instanceof Error ? err.message : String(err) })
      return serverError(receiptFailureResponseMessage(failure))
    }
  } catch (err) {
    logger.error('receipt-retry', 'POST error', { message: err instanceof Error ? err.message : String(err) })
    return serverError()
  }
}

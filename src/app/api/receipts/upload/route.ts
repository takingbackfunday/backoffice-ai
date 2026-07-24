import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, conflict, serverError } from '@/lib/api-response'
import { mistralOcr } from '@/lib/ocr/mistral'
import { extractReceiptData } from '@/lib/ocr/extract-receipt'
import { compressReceiptImage } from '@/lib/ocr/compress-image'
import { classifyReceiptPipelineError, receiptFailureResponseMessage, type ReceiptPipelineStage } from '@/lib/ocr/receipt-failure'
import { UTApi } from 'uploadthing/server'
import { logger } from '@/lib/log'

const utapi = new UTApi()

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const UploadSchema = z.object({
  /** Full data URI: "data:image/jpeg;base64,/9j/4AAQ..." */
  image: z.string().min(100),
  /** Optional: link to an existing transaction */
  transactionId: z.string().optional(),
  /** Optional: assign to a client workspace at upload time */
  workspaceId: z.string().optional(),
  /** Bypass duplicate-check when user confirms they want to re-upload */
  force: z.boolean().optional().default(false),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = UploadSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { image, transactionId, workspaceId, force } = parsed.data

    // ── Validate data URI format ──────────────────────────────────────────
    const dataUriMatch = image.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!dataUriMatch) return badRequest('Invalid image data URI format')

    const mimeType = dataUriMatch[1]
    const base64Data = dataUriMatch[2]
    const imageBuffer = Buffer.from(base64Data, 'base64')

    if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
      return badRequest(
        `Image too large: ${Math.round(imageBuffer.length / 1024)}KB exceeds 10MB limit`
      )
    }

    // ── Validate transaction ownership if provided ────────────────────────
    if (transactionId) {
      const txn = await prisma.transaction.findFirst({
        where: { id: transactionId, account: { userId } },
        select: { id: true },
      })
      if (!txn) return badRequest('Transaction not found or does not belong to you')
    }

    // ── Validate workspace ownership if provided ──────────────────────────
    if (workspaceId) {
      const ws = await prisma.workspace.findFirst({
        where: { id: workspaceId, userId },
        select: { id: true },
      })
      if (!ws) return badRequest('Workspace not found or does not belong to you')
    }

    // ── Hash original for integrity ───────────────────────────────────────
    const originalHash = createHash('sha256').update(imageBuffer).digest('hex')
    const originalSizeKb = Math.round(imageBuffer.length / 1024)

    // ── Duplicate check ─────────────────────────────────────────────────────
    if (!force) {
      const existing = await prisma.receipt.findFirst({
        where: { userId, originalHash },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      })
      if (existing) {
        return conflict('DUPLICATE_RECEIPT', { meta: { existingReceiptId: existing.id } })
      }
    }

    // ── Create receipt row (PROCESSING) ───────────────────────────────────
    const receipt = await prisma.receipt.create({
      data: {
        userId,
        transactionId: transactionId ?? null,
        workspaceId: workspaceId ?? null,
        status: 'PROCESSING',
        originalHash,
        originalSizeKb,
        mimeType,
      },
    })

    // ── Run pipeline ──────────────────────────────────────────────────────
    let ocrMarkdown = ''
    let extractedData = {}
    let thumbnailUrl: string | null = null
    let stage: ReceiptPipelineStage = 'ocr'

    try {
      // Step 1: Mistral OCR
      const ocr = await mistralOcr(image) // pass the full data URI
      ocrMarkdown = ocr.markdown

      // Step 2: Save a thumbnail before AI extraction so provider failures can be retried.
      stage = 'thumbnail'
      const compressed = await compressReceiptImage(imageBuffer)
      const blob = new Blob([compressed.buffer.buffer as ArrayBuffer], { type: compressed.mimeType })
      const file = new File([blob], `receipt-${receipt.id}.webp`, { type: compressed.mimeType })
      const uploadResult = await utapi.uploadFiles(file)

      if (uploadResult.error) {
        logger.error('receipt-upload', 'thumbnail error', { detail: String(uploadResult.error) })
      } else {
        thumbnailUrl = uploadResult.data.ufsUrl
      }

      // Step 3: LLM extraction
      stage = 'extract'
      const extracted = await extractReceiptData(ocrMarkdown)
      extractedData = extracted

      // Step 4: Content-based duplicate check (different photo of same receipt)
      if (!force) {
        const vendor = (extractedData as Record<string, unknown>).vendor
        const date = (extractedData as Record<string, unknown>).date
        const total = (extractedData as Record<string, unknown>).total
        if (typeof vendor === 'string' && typeof date === 'string' && typeof total === 'number') {
          const existingContent = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id
            FROM "Receipt"
            WHERE "userId" = ${userId}
              AND "id" != ${receipt.id}
              AND "status" != 'FAILED'
              AND "extractedData"->>'vendor' ILIKE ${vendor.trim()}
              AND "extractedData"->>'date' = ${date.trim()}
              AND ABS(("extractedData"->>'total')::numeric - ${total}) < 0.01
              AND "createdAt" > NOW() - INTERVAL '30 days'
            ORDER BY "createdAt" DESC
            LIMIT 1
          `
          if (existingContent.length > 0) {
            // Clean up the row we just created — this was a duplicate
            await prisma.receipt.delete({ where: { id: receipt.id } })
            return conflict('DUPLICATE_RECEIPT', {
              meta: {
                existingReceiptId: existingContent[0].id,
                duplicateType: 'content',
              },
            })
          }
        }
      }

      // Step 5: Update receipt with all extracted data — lands in NEEDS_REVIEW for human confirmation
      const updated = await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          status: 'NEEDS_REVIEW',
          ocrMarkdown,
          extractedData,
          thumbnailUrl,
        },
      })

      return ok(updated)
    } catch (pipelineErr) {
      const failure = classifyReceiptPipelineError(stage, pipelineErr)
      logger.error('receipt-upload', 'pipeline error', { receiptId: receipt.id, ...failure, cause: pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr) })

      // Save whatever we got — partial data is better than nothing
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          status: 'FAILED',
          ocrMarkdown: ocrMarkdown || null,
          extractedData: Object.keys(extractedData).length > 0
            ? extractedData as Prisma.InputJsonValue
            : JSON.parse(JSON.stringify({ failure })) as Prisma.InputJsonValue,
          thumbnailUrl,
        },
      })

      return serverError(receiptFailureResponseMessage(failure))
    }
  } catch (err) {
    logger.error('receipt-upload', 'POST error', { message: err instanceof Error ? err.message : String(err) })
    return serverError()
  }
}

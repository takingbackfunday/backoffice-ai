import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { mistralOcr } from '@/lib/ocr/mistral'
import { extractReceiptData } from '@/lib/ocr/extract-receipt'
import { compressReceiptImage } from '@/lib/ocr/compress-image'
import { UTApi } from 'uploadthing/server'

const utapi = new UTApi()

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const UploadSchema = z.object({
  /** Full data URI: "data:image/jpeg;base64,/9j/4AAQ..." */
  image: z.string().min(100),
  /** Optional: link to an existing transaction */
  transactionId: z.string().optional(),
  /** Optional: assign to a client workspace at upload time */
  workspaceId: z.string().optional(),
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

    const { image, transactionId, workspaceId } = parsed.data

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

    try {
      // Step 1: Mistral OCR
      const ocr = await mistralOcr(image) // pass the full data URI
      ocrMarkdown = ocr.markdown

      // Step 2: LLM extraction (parallel with image compression)
      const [extracted, compressed] = await Promise.all([
        extractReceiptData(ocrMarkdown),
        compressReceiptImage(imageBuffer),
      ])
      extractedData = extracted

      // Step 3: Upload thumbnail to UploadThing
      const blob = new Blob([compressed.buffer.buffer as ArrayBuffer], { type: compressed.mimeType })
      const file = new File([blob], `receipt-${receipt.id}.webp`, { type: compressed.mimeType })
      const uploadResult = await utapi.uploadFiles(file)

      if (uploadResult.error) {
        console.error('[receipt:upload-thumb]', uploadResult.error)
      } else {
        thumbnailUrl = uploadResult.data.ufsUrl
      }

      // Step 4: Update receipt with all extracted data — lands in NEEDS_REVIEW for human confirmation
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
      console.error('[receipt:pipeline-error]', pipelineErr)

      // Save whatever we got — partial data is better than nothing
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          status: 'FAILED',
          ocrMarkdown: ocrMarkdown || null,
          extractedData: Object.keys(extractedData).length > 0 ? extractedData : undefined,
          thumbnailUrl,
        },
      })

      return serverError('Receipt processing failed. The receipt was saved and can be retried.')
    }
  } catch (err) {
    console.error('[/api/receipts/upload]', err)
    return serverError()
  }
}

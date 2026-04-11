import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { mistralOcr } from '@/lib/ocr/mistral'
import { extractReceiptData } from '@/lib/ocr/extract-receipt'

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

    try {
      const ocr = await mistralOcr(receipt.thumbnailUrl)
      const extracted = await extractReceiptData(ocr.markdown)

      const updated = await prisma.receipt.update({
        where: { id },
        data: {
          status: 'NEEDS_REVIEW',
          ocrMarkdown: ocr.markdown,
          // JSON round-trip widens ExtractedReceiptData to Prisma's InputJsonValue
          extractedData: JSON.parse(JSON.stringify(extracted)),
        },
      })

      return ok(updated)
    } catch (err) {
      await prisma.receipt.update({ where: { id }, data: { status: 'FAILED' } })
      console.error('[receipt:retry-error]', err)
      return serverError('Retry failed')
    }
  } catch (err) {
    console.error('[/api/receipts/[id]/retry]', err)
    return serverError()
  }
}

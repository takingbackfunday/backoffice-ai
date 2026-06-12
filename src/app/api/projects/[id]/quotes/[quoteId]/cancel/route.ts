import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { logger } from '@/lib/log'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfile: { workspace: { id, userId } } },
      include: { _count: { select: { invoices: true } } },
    })
    if (!quote) return notFound('Quote not found')

    if (!['SENT', 'ACCEPTED'].includes(quote.status)) {
      return badRequest('Only sent or accepted quotes can be cancelled')
    }
    if (quote._count.invoices > 0) {
      return badRequest('This quote has linked invoices. Void them before cancelling the quote.')
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'REJECTED' },
    })

    return ok(JSON.parse(JSON.stringify(updated)))
  } catch (e) {
    logger.error('quote-cancel', 'POST error', { message: e instanceof Error ? e.message : String(e) })
    return serverError()
  }
}

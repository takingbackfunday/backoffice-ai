import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfile: { workspace: { id, userId } } },
    })
    if (!quote) return notFound('Quote not found')
    if (quote.status !== 'SENT') {
      return badRequest('Only sent quotes can be accepted')
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'ACCEPTED', signedAt: new Date() },
    })

    return ok(JSON.parse(JSON.stringify(updated)))
  } catch (e) {
    console.error('[quote accept]', e)
    return serverError()
  }
}

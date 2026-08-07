import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { created, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { logger } from '@/lib/log'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfile: { workspace: { id, userId } } },
      include: {
        sections: { include: { items: true }, orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!quote) return notFound('Quote not found')
    if (!['SENT', 'REJECTED', 'DRAFT'].includes(quote.status)) {
      return badRequest('Cannot revise an accepted or superseded quote')
    }

    const quoteCount = await prisma.quote.count({
      where: { clientProfile: { workspace: { userId } } },
    })
    const quoteNumber = `QTE-${String(quoteCount + 1).padStart(4, '0')}`

    const revision = await prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: quoteId }, data: { status: 'SUPERSEDED' } })

      return tx.quote.create({
        data: {
          jobId: quote.jobId,
          clientProfileId: quote.clientProfileId,
          quoteNumber,
          title: quote.title,
          currency: quote.currency,
          version: quote.version + 1,
          validUntil: quote.validUntil,
          paymentSchedule: quote.paymentSchedule ?? undefined,
          scopeNotes: quote.scopeNotes,
          terms: quote.terms,
          notes: quote.notes,
          totalCost: quote.totalCost,
          totalQuoted: quote.totalQuoted,
          overrides: quote.overrides ?? undefined,
          previousVersionId: quoteId,
          sections: {
            create: quote.sections.map((s, si) => ({
              name: s.name,
              sortOrder: s.sortOrder ?? si,
              items: {
                create: s.items.map((item, ii) => ({
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                  unitPrice: item.unitPrice,
                  costRate: item.costRate,
                  tags: item.tags,
                  internalNotes: item.internalNotes,
                  riskLevel: item.riskLevel,
                  priceManual: item.priceManual,
                  isOptional: item.isOptional,
                  sortOrder: item.sortOrder ?? ii,
                  marginPercent: item.marginPercent,
                })),
              },
            })),
          },
        },
        include: {
          sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        },
      })
    })

    return created(JSON.parse(JSON.stringify(revision)))
  } catch (e) {
    logger.error('quote-revise', 'POST error', { message: e instanceof Error ? e.message : String(e) })
    return serverError()
  }
}

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { created, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { parsePreferences } from '@/types/preferences'
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
    if (quote.isAmendment) {
      return badRequest('Cannot duplicate an amendment')
    }

    const quoteCount = await prisma.quote.count({
      where: { clientProfile: { workspace: { userId } } },
    })
    const quoteNumber = `QTE-${String(quoteCount + 1).padStart(4, '0')}`

    const userPref = await prisma.userPreference.findUnique({ where: { userId } })
    const prefData = parsePreferences(userPref?.data)
    const defaultValidityDays = prefData.quoteValidityDays ?? 30
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + defaultValidityDays)

    const duplicate = await prisma.quote.create({
      data: {
        jobId: quote.jobId,
        clientProfileId: quote.clientProfileId,
        quoteNumber,
        title: `${quote.title} (copy)`,
        currency: quote.currency,
        validUntil,
        terms: quote.terms,
        notes: quote.notes,
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

    return created(JSON.parse(JSON.stringify(duplicate)))
  } catch (e) {
    logger.error('quote-duplicate', 'POST error', { message: e instanceof Error ? e.message : String(e) })
    return serverError()
  }
}

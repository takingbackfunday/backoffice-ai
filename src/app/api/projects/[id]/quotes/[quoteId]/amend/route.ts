import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { quoteTotals } from '@/lib/quote-pricing'
import { logger } from '@/lib/log'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

const AmendSchema = z.object({
  title: z.string().min(1, 'Amendment title is required'),
  sections: z.array(z.object({
    name: z.string().min(1),
    sortOrder: z.number().int().default(0),
    items: z.array(z.object({
      description: z.string().min(1),
      quantity: z.number().positive(),
      unit: z.string().optional().nullable(),
      unitPrice: z.number().min(0),
      isOptional: z.boolean().default(false),
      sortOrder: z.number().int().default(0),
    })).default([]),
  })).default([]),
})

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfile: { workspace: { id, userId } } },
    })
    if (!quote) return notFound('Quote not found')
    if (quote.status !== 'ACCEPTED') {
      return badRequest('Amendments can only be created for accepted quotes')
    }

    const body = await request.json()
    const parsed = AmendSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const quoteCount = await prisma.quote.count({
      where: { clientProfile: { workspace: { userId } } },
    })
    const quoteNumber = `QTE-${String(quoteCount + 1).padStart(4, '0')}`

    const allItems = parsed.data.sections.flatMap(s => s.items.map(i => ({
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      costRate: null,
      isOptional: i.isOptional,
    })))
    const totals = quoteTotals(allItems)

    const rootQuoteId = quote.rootQuoteId ?? quote.id

    const amendment = await prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: quoteId }, data: { status: 'AMENDED' } })

      return tx.quote.create({
        data: {
          jobId: quote.jobId,
          clientProfileId: quote.clientProfileId,
          quoteNumber,
          title: parsed.data.title,
          currency: quote.currency,
          isAmendment: true,
          parentQuoteId: quoteId,
          rootQuoteId,
          totalCost: totals.totalCost || null,
          totalQuoted: totals.totalQuoted || null,
          sections: {
            create: parsed.data.sections.map((s, si) => ({
              name: s.name,
              sortOrder: s.sortOrder ?? si,
              items: {
                create: s.items.map((item, ii) => ({
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                  unitPrice: item.unitPrice,
                  isOptional: item.isOptional,
                  sortOrder: item.sortOrder ?? ii,
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

    return created(JSON.parse(JSON.stringify(amendment)))
  } catch (e) {
    logger.error('quote-amend', 'POST error', { message: e instanceof Error ? e.message : String(e) })
    return serverError()
  }
}

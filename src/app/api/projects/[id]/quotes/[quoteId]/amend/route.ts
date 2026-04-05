import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

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
      costBasis: z.number().optional().nullable(),
      marginPercent: z.number().optional().nullable(),
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

    const totalQuoted = parsed.data.sections.reduce((sum, s) =>
      sum + s.items.reduce((si, i) => si + i.unitPrice * i.quantity, 0), 0)
    const totalCost = parsed.data.sections.reduce((sum, s) =>
      sum + s.items.reduce((si, i) => si + (i.costBasis ?? 0), 0), 0)

    const amendment = await prisma.$transaction(async (tx) => {
      // Mark original as AMENDED
      await tx.quote.update({ where: { id: quoteId }, data: { status: 'AMENDED' } })

      return tx.quote.create({
        data: {
          estimateId: quote.estimateId,
          jobId: quote.jobId,
          clientProfileId: quote.clientProfileId,
          quoteNumber,
          title: parsed.data.title,
          currency: quote.currency,
          isAmendment: true,
          parentQuoteId: quoteId,
          totalCost,
          totalQuoted,
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
                  costBasis: item.costBasis,
                  marginPercent: item.marginPercent,
                  hasEstimateLink: false,
                  sourceItemIds: [],
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
    console.error('[quote amend]', e)
    return serverError()
  }
}

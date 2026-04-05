import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

async function getQuoteForUser(quoteId: string, projectId: string, userId: string) {
  return prisma.quote.findFirst({
    where: {
      id: quoteId,
      clientProfile: { workspace: { id: projectId, userId } },
    },
    include: {
      sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      estimate: { select: { id: true, title: true, version: true } },
      job: { select: { id: true, name: true } },
      clientProfile: { select: { id: true, contactName: true, email: true, company: true } },
      previousVersion: { select: { id: true, quoteNumber: true, version: true } },
      nextVersion: { select: { id: true, quoteNumber: true, version: true } },
      amendments: { select: { id: true, quoteNumber: true, status: true, totalQuoted: true, signedAt: true } },
      _count: { select: { invoices: true } },
    },
  })
}

const QuoteLineItemUpdateSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional().nullable(),
  unitPrice: z.number().min(0),
  isOptional: z.boolean().default(false),
  hasEstimateLink: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  costBasis: z.number().optional().nullable(),
  marginPercent: z.number().optional().nullable(),
  sourceItemIds: z.array(z.string()).default([]),
})

const QuoteSectionUpdateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  items: z.array(QuoteLineItemUpdateSchema).default([]),
})

const UpdateQuoteSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'AMENDED']).optional(),
  currency: z.string().optional(),
  validUntil: z.string().optional().nullable(),
  paymentSchedule: z.array(z.object({ milestone: z.string(), percent: z.number() })).optional().nullable(),
  scopeNotes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  overrides: z.record(z.unknown()).optional().nullable(),
  sections: z.array(QuoteSectionUpdateSchema).optional(),
})

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await getQuoteForUser(quoteId, id, userId)
    if (!quote) return notFound('Quote not found')

    return ok(JSON.parse(JSON.stringify(quote)))
  } catch (e) {
    console.error('[quote GET]', e)
    return serverError()
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        clientProfile: { workspace: { id, userId } },
      },
    })
    if (!quote) return notFound('Quote not found')

    if (quote.status === 'ACCEPTED') {
      return badRequest('Accepted quotes cannot be edited. Create an amendment instead.')
    }

    const body = await request.json()
    const parsed = UpdateQuoteSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { sections, validUntil, paymentSchedule, overrides, ...rest } = parsed.data
    const paymentScheduleValue = paymentSchedule === null
      ? Prisma.JsonNull
      : paymentSchedule !== undefined
        ? paymentSchedule
        : undefined
    const overridesValue = overrides === null
      ? Prisma.JsonNull
      : overrides !== undefined
        ? (overrides as Prisma.InputJsonValue)
        : undefined

    const updated = await prisma.$transaction(async (tx) => {
      if (sections !== undefined) {
        await tx.quoteSection.deleteMany({ where: { quoteId } })
        // Recompute totals
        const totalCost = sections.reduce((sum, s) =>
          sum + s.items.reduce((si, i) => si + (i.costBasis ?? 0), 0), 0)
        const totalQuoted = sections.reduce((sum, s) =>
          sum + s.items.reduce((si, i) => si + i.unitPrice * i.quantity, 0), 0)

        await tx.quote.update({
          where: { id: quoteId },
          data: {
            ...rest,
            paymentSchedule: paymentScheduleValue,
            overrides: overridesValue,
            validUntil: validUntil ? new Date(validUntil) : undefined,
            totalCost,
            totalQuoted,
            sections: {
              create: sections.map((s, si) => ({
                name: s.name,
                sortOrder: s.sortOrder ?? si,
                items: {
                  create: s.items.map((item, ii) => ({
                    description: item.description,
                    quantity: item.quantity,
                    unit: item.unit,
                    unitPrice: item.unitPrice,
                    isOptional: item.isOptional,
                    hasEstimateLink: item.hasEstimateLink,
                    sortOrder: item.sortOrder ?? ii,
                    costBasis: item.costBasis,
                    marginPercent: item.marginPercent,
                    sourceItemIds: item.sourceItemIds,
                  })),
                },
              })),
            },
          },
        })
      } else {
        await tx.quote.update({
          where: { id: quoteId },
          data: {
            ...rest,
            paymentSchedule: paymentScheduleValue,
            overrides: overridesValue,
            validUntil: validUntil ? new Date(validUntil) : undefined,
          },
        })
      }

      return tx.quote.findUnique({
        where: { id: quoteId },
        include: {
          sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
          estimate: { select: { id: true, title: true, version: true } },
          job: { select: { id: true, name: true } },
          clientProfile: { select: { id: true, contactName: true, email: true, company: true } },
        },
      })
    })

    return ok(JSON.parse(JSON.stringify(updated)))
  } catch (e) {
    console.error('[quote PATCH]', e)
    return serverError()
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        clientProfile: { workspace: { id, userId } },
      },
    })
    if (!quote) return notFound('Quote not found')
    if (quote.status !== 'DRAFT') {
      return badRequest('Only draft quotes can be deleted')
    }

    await prisma.quote.delete({ where: { id: quoteId } })
    return ok({ id: quoteId })
  } catch (e) {
    console.error('[quote DELETE]', e)
    return serverError()
  }
}

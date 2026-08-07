import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { ok, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireQuote } from '@/lib/authz'
import { itemMarginPercent, quoteTotals } from '@/lib/quote-pricing'

const ParamsSchema = z.object({ id: z.string(), quoteId: z.string() })

const QuoteLineItemUpdateSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unit: z.string().optional().nullable(),
  unitPrice: z.number().min(0),
  costRate: z.number().min(0).optional().nullable(),
  tags: z.array(z.string()).default([]),
  internalNotes: z.string().optional().nullable(),
  riskLevel: z.string().optional().nullable(),
  priceManual: z.boolean().default(false),
  isOptional: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
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

const quoteInclude = {
  sections: { include: { items: { orderBy: { sortOrder: 'asc' as const } } }, orderBy: { sortOrder: 'asc' as const } },
  job: { select: { id: true, name: true } },
  clientProfile: { select: { id: true, contactName: true, email: true, company: true } },
  previousVersion: { select: { id: true, quoteNumber: true, version: true } },
  nextVersion: { select: { id: true, quoteNumber: true, version: true } },
  amendments: { select: { id: true, quoteNumber: true, status: true, totalQuoted: true, signedAt: true } },
  _count: { select: { invoices: true } },
}

export const GET = authedRoute<{ id: string; quoteId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const quote = await requireQuote(userId, params.quoteId, params.id)
    const full = await prisma.quote.findUnique({ where: { id: quote.id }, include: quoteInclude })
    return ok(JSON.parse(JSON.stringify(full)))
  },
})

export const PATCH = authedRoute<{ id: string; quoteId: string }, z.infer<typeof UpdateQuoteSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: UpdateQuoteSchema,
  handler: async ({ userId, params, body }) => {
    const quote = await requireQuote(userId, params.quoteId, params.id)
    if (quote.status === 'ACCEPTED') {
      return badRequest('Accepted quotes cannot be edited. Create an amendment instead.')
    }

    const { sections, validUntil, paymentSchedule, overrides, ...rest } = body
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
        await tx.quoteSection.deleteMany({ where: { quoteId: params.quoteId } })

        const allItems = sections.flatMap(s => s.items.map(i => ({
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          costRate: i.costRate ?? null,
          isOptional: i.isOptional,
        })))
        const totals = quoteTotals(allItems.map(i => ({
          ...i,
          costRate: i.costRate ? Number(i.costRate) : null,
        })))

        await tx.quote.update({
          where: { id: params.quoteId },
          data: {
            ...rest,
            paymentSchedule: paymentScheduleValue,
            overrides: overridesValue,
            validUntil: validUntil ? new Date(validUntil) : undefined,
            totalCost: totals.totalCost || null,
            totalQuoted: totals.totalQuoted || null,
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
                    costRate: item.costRate,
                    tags: item.tags,
                    internalNotes: item.internalNotes,
                    riskLevel: item.riskLevel,
                    priceManual: item.priceManual,
                    isOptional: item.isOptional,
                    sortOrder: item.sortOrder ?? ii,
                    marginPercent: item.costRate != null && item.costRate > 0
                      ? itemMarginPercent(Number(item.costRate), item.unitPrice)
                      : null,
                  })),
                },
              })),
            },
          },
        })
      } else {
        await tx.quote.update({
          where: { id: params.quoteId },
          data: {
            ...rest,
            paymentSchedule: paymentScheduleValue,
            overrides: overridesValue,
            validUntil: validUntil ? new Date(validUntil) : undefined,
          },
        })
      }

      return tx.quote.findUnique({
        where: { id: params.quoteId },
        include: quoteInclude,
      })
    })

    return ok(JSON.parse(JSON.stringify(updated)))
  },
})

export const DELETE = authedRoute<{ id: string; quoteId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const quote = await requireQuote(userId, params.quoteId, params.id)
    if (quote.status !== 'DRAFT') {
      return badRequest('Only draft quotes can be deleted')
    }
    await prisma.quote.delete({ where: { id: params.quoteId } })
    return ok({ id: params.quoteId })
  },
})

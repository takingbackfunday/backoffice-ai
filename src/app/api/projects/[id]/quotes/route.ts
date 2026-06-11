import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace } from '@/lib/authz'
import { parsePreferences } from '@/types/preferences'
import type { Prisma } from '@/generated/prisma/client'

const ParamsSchema = z.object({ id: z.string() })

type ClientWorkspace = Prisma.WorkspaceGetPayload<{
  include: { clientProfile: true }
}>

const GenerateQuoteSchema = z.object({
  estimateId: z.string().min(1).optional(),
  jobId: z.string().min(1, 'Job ID is required'),
  title: z.string().optional(),
})

export const GET = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const project = await requireWorkspace(userId, params.id, { clientProfile: true }) as ClientWorkspace
    if (!project.clientProfile) return badRequest('Client project not found')

    const quotes = await prisma.quote.findMany({
      where: { clientProfileId: project.clientProfile.id },
      include: {
        sections: { include: { items: true } },
        job: { select: { id: true, name: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return ok(JSON.parse(JSON.stringify(quotes)), { count: quotes.length })
  },
})

export const POST = authedRoute<{ id: string }, z.infer<typeof GenerateQuoteSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: GenerateQuoteSchema,
  handler: async ({ userId, params, body }) => {
    const project = await requireWorkspace(userId, params.id, { clientProfile: true }) as ClientWorkspace
    if (!project.clientProfile) return badRequest('Client project not found')

    const { estimateId, jobId, title } = body

    const job = await prisma.job.findFirst({
      where: { id: jobId, clientProfile: { workspace: { id: params.id, userId } } },
    })
    if (!job) return badRequest('Job not found')

    const estimateInclude = {
      sections: {
        include: { items: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    }

    let estimate
    if (estimateId) {
      estimate = await prisma.estimate.findFirst({
        where: { id: estimateId, workspaceId: params.id },
        include: estimateInclude,
      })
      if (!estimate) return badRequest('Estimate not found')
      if (estimate.status === 'DRAFT') {
        return badRequest('Finalize the estimate before generating a quote')
      }
    } else {
      estimate = await prisma.estimate.create({
        data: {
          workspaceId: params.id,
          title: title ?? 'Untitled Quote',
          currency: project.clientProfile.currency ?? 'USD',
          status: 'DRAFT',
          sections: { create: [{ name: 'Services', sortOrder: 0 }] },
        },
        include: estimateInclude,
      })
    }

    const marginRules = await prisma.marginRule.findMany({ where: { userId } })
    const marginByTag = new Map(marginRules.map(r => [r.tag, Number(r.marginPct)]))

    const userPref = await prisma.userPreference.findUnique({ where: { userId } })
    const prefData = parsePreferences(userPref?.data)
    const defaultValidityDays = prefData.quoteValidityDays ?? 30
    const defaultTerms = prefData.quoteTerms ?? null

    const quoteCount = await prisma.quote.count({
      where: { clientProfile: { workspace: { userId } } },
    })
    const quoteNumber = `QTE-${String(quoteCount + 1).padStart(4, '0')}`

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + defaultValidityDays)

    const quoteSections = estimate.sections
      .filter(s => s.items.length > 0)
      .map(section => {
        const itemsWithCost = section.items.map(item => {
          const hours = item.hours ? Number(item.hours) : null
          const costRate = item.costRate ? Number(item.costRate) : null
          const quantity = Number(item.quantity)

          let costBasis = 0
          if (hours !== null && costRate !== null) {
            costBasis = hours * costRate * quantity
          } else if (costRate !== null) {
            costBasis = costRate * quantity
          }

          let margin = 0
          for (const tag of item.tags) {
            const tagMargin = marginByTag.get(tag)
            if (tagMargin !== undefined && tagMargin > margin) {
              margin = tagMargin
            }
          }

          return { item, costBasis, margin }
        })

        const totalCostBasis = itemsWithCost.reduce((sum, i) => sum + i.costBasis, 0)
        const blendedMargin = itemsWithCost.length > 0
          ? itemsWithCost.reduce((sum, i) => sum + i.margin, 0) / itemsWithCost.length
          : 0
        const unitPrice = totalCostBasis * (1 + blendedMargin / 100)
        const sourceItemIds = section.items.map(i => i.id)
        return {
          sectionName: section.name,
          sortOrder: section.sortOrder,
          items: [{
            description: section.name,
            quantity: 1,
            unitPrice: Math.round(unitPrice * 100) / 100,
            isOptional: false,
            hasEstimateLink: true,
            sortOrder: 0,
            costBasis: totalCostBasis,
            marginPercent: Math.round(blendedMargin * 100) / 100,
            sourceItemIds,
          }],
        }
      })

    const totalCost = quoteSections.reduce((sum, s) =>
      sum + s.items.reduce((si, i) => si + i.costBasis, 0), 0)
    const totalQuoted = quoteSections.reduce((sum, s) =>
      sum + s.items.reduce((si, i) => si + i.unitPrice * i.quantity, 0), 0)

    const quote = await prisma.quote.create({
      data: {
        estimateId: estimate.id,
        jobId,
        clientProfileId: project.clientProfile.id,
        quoteNumber,
        title: title ?? estimate.title,
        currency: estimate.currency,
        validUntil,
        terms: defaultTerms,
        totalCost,
        totalQuoted,
        sections: {
          create: quoteSections.map(s => ({
            name: s.sectionName,
            sortOrder: s.sortOrder,
            items: {
              create: s.items.map(item => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                isOptional: item.isOptional,
                hasEstimateLink: item.hasEstimateLink,
                sortOrder: item.sortOrder,
                costBasis: item.costBasis,
                marginPercent: item.marginPercent,
                sourceItemIds: item.sourceItemIds,
              })),
            },
          })),
        },
      },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        estimate: { select: { id: true, title: true, version: true } },
        job: { select: { id: true, name: true } },
      },
    })

    return created(JSON.parse(JSON.stringify(quote)))
  },
})

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Client project not found')

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
  } catch (e) {
    console.error('[quotes GET]', e)
    return serverError()
  }
}

const GenerateQuoteSchema = z.object({
  estimateId: z.string().min(1, 'Estimate ID is required'),
  title: z.string().optional(),
})

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Client project not found')

    const body = await request.json()
    const parsed = GenerateQuoteSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { estimateId, title } = parsed.data

    // Load estimate with all sections and items
    const estimate = await prisma.estimate.findFirst({
      where: {
        id: estimateId,
        job: { clientProfile: { workspace: { id, userId } } },
      },
      include: {
        sections: {
          include: { items: true },
          orderBy: { sortOrder: 'asc' },
        },
        job: true,
      },
    })
    if (!estimate) return notFound('Estimate not found')
    if (estimate.status === 'DRAFT') {
      return badRequest('Finalize the estimate before generating a quote')
    }

    // Load user's margin rules
    const marginRules = await prisma.marginRule.findMany({ where: { userId } })
    const marginByTag = new Map(marginRules.map(r => [r.tag, Number(r.marginPct)]))

    // Load user preferences for defaults
    const userPref = await prisma.userPreference.findUnique({ where: { userId } })
    const prefData = (userPref?.data as Record<string, unknown>) ?? {}
    const defaultValidityDays = (prefData.quoteValidityDays as number) ?? 30
    const defaultTerms = (prefData.quoteTerms as string) ?? null

    // Check for previous version overrides (from previousVersionId if regenerating)
    // For now, we generate fresh (overrides applied later via PATCH)

    // Generate quote number
    const quoteCount = await prisma.quote.count({
      where: { clientProfile: { workspace: { userId } } },
    })
    const quoteNumber = `QTE-${String(quoteCount + 1).padStart(4, '0')}`

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + defaultValidityDays)

    // Build sections and line items (collapse to section level by default)
    const quoteSections = estimate.sections
      .filter(s => s.items.length > 0)
      .map(section => {
        // Compute cost basis per item
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

          // Determine margin: highest priority tag match or 0
          let margin = 0
          for (const tag of item.tags) {
            const tagMargin = marginByTag.get(tag)
            if (tagMargin !== undefined && tagMargin > margin) {
              margin = tagMargin
            }
          }

          return { item, costBasis, margin }
        })

        // Section-level aggregation (collapsed view)
        const totalCostBasis = itemsWithCost.reduce((sum, i) => sum + i.costBasis, 0)
        const blendedMargin = itemsWithCost.length > 0
          ? itemsWithCost.reduce((sum, i) => sum + i.margin, 0) / itemsWithCost.length
          : 0
        const unitPrice = totalCostBasis * (1 + blendedMargin / 100)
        const sourceItemIds = section.items.map(i => i.id)
        const hasOptional = section.items.some(i => i.isOptional)

        return {
          sectionName: section.name,
          sortOrder: section.sortOrder,
          items: [{
            description: section.name,
            quantity: 1,
            unitPrice: Math.round(unitPrice * 100) / 100,
            isOptional: hasOptional,
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
        estimateId,
        jobId: estimate.jobId,
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
  } catch (e) {
    console.error('[quotes POST]', e)
    return serverError()
  }
}

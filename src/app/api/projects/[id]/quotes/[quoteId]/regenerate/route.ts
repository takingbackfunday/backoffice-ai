import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { toDisplay } from '@/lib/money'

const ItemSchema = z.object({
  description: z.string().min(1),
  hours: z.number().optional().nullable(),
  costRate: z.number().optional().nullable(),
  quantity: z.number().positive().default(1),
  unit: z.string().optional().nullable(),
  isOptional: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

const SectionSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  items: z.array(ItemSchema).default([]),
})

const RegenerateSchema = z.object({
  sections: z.array(SectionSchema).min(1),
})

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Project not found')

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfileId: project.clientProfile.id },
      include: { estimate: true },
    })
    if (!quote) return notFound('Quote not found')
    if (quote.status !== 'DRAFT') return badRequest('Only draft quotes can be regenerated')
    if (!quote.estimate || quote.estimate.status !== 'DRAFT') {
      return badRequest('Quote estimate is not in a buildable state')
    }

    const body = await request.json()
    const parsed = RegenerateSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { sections } = parsed.data
    if (sections.every(s => s.items.length === 0)) {
      return badRequest('Add at least one item before generating')
    }

    const marginRules = await prisma.marginRule.findMany({ where: { userId } })
    const marginByTag = new Map(marginRules.map(r => [r.tag, toDisplay(r.marginPct)]))

    const estimateId = quote.estimate.id

    const updatedQuote = await prisma.$transaction(async (tx) => {
      // Rebuild estimate sections + items
      await tx.estimateSection.deleteMany({ where: { estimateId } })
      const createdSections = await Promise.all(
        sections.map((s, si) =>
          tx.estimateSection.create({
            data: {
              estimateId,
              name: s.name,
              sortOrder: s.sortOrder ?? si,
              items: {
                create: s.items.map((item, ii) => ({
                  description: item.description,
                  hours: item.hours,
                  costRate: item.costRate,
                  quantity: item.quantity,
                  unit: item.unit,
                  isOptional: item.isOptional,
                  tags: [],
                  sortOrder: item.sortOrder ?? ii,
                })),
              },
            },
            include: { items: { orderBy: { sortOrder: 'asc' } } },
          })
        )
      )

      await tx.estimate.update({ where: { id: estimateId }, data: { status: 'FINAL' } })

      // Build quote sections (collapsed to section level, same logic as POST /quotes)
      const quoteSections = createdSections
        .filter(s => s.items.length > 0)
        .map(section => {
          const itemsWithCost = section.items.map(item => {
            const hours = item.hours ? toDisplay(item.hours) : null
            const costRate = item.costRate ? toDisplay(item.costRate) : null
            const quantity = toDisplay(item.quantity)
            let costBasis = 0
            if (hours !== null && costRate !== null) {
              costBasis = hours * costRate * quantity
            } else if (costRate !== null) {
              costBasis = costRate * quantity
            }
            // Tags are empty on inline-created items; margin defaults to 0
            let margin = 0
            for (const tag of item.tags) {
              const tagMargin = marginByTag.get(tag)
              if (tagMargin !== undefined && tagMargin > margin) margin = tagMargin
            }
            return { item, costBasis, margin }
          })

          const totalCostBasis = itemsWithCost.reduce((sum, i) => sum + i.costBasis, 0)
          const blendedMargin = itemsWithCost.length > 0
            ? itemsWithCost.reduce((sum, i) => sum + i.margin, 0) / itemsWithCost.length
            : 0
          const unitPrice = totalCostBasis > 0 ? totalCostBasis * (1 + blendedMargin / 100) : 0
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

      const totalCost = quoteSections.reduce((sum, s) => sum + s.items.reduce((si, i) => si + i.costBasis, 0), 0)
      const totalQuoted = quoteSections.reduce((sum, s) => sum + s.items.reduce((si, i) => si + i.unitPrice * i.quantity, 0), 0)

      await tx.quoteSection.deleteMany({ where: { quoteId } })
      await tx.quote.update({
        where: { id: quoteId },
        data: {
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
      })

      return tx.quote.findUnique({
        where: { id: quoteId },
        include: {
          sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
          estimate: {
            include: {
              sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      })
    })

    return ok(JSON.parse(JSON.stringify(updatedQuote)))
  } catch (e) {
    console.error('[quotes regenerate POST]', e)
    return serverError()
  }
}

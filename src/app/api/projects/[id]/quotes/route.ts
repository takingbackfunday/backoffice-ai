import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace } from '@/lib/authz'
import { parsePreferences } from '@/types/preferences'
import { autoPrice, quoteTotals } from '@/lib/quote-pricing'
import type { Prisma } from '@/generated/prisma/client'

const ParamsSchema = z.object({ id: z.string() })

type ClientWorkspace = Prisma.WorkspaceGetPayload<{
  include: { clientProfile: true }
}>

const CreateQuoteSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  title: z.string().optional(),
  templateId: z.string().min(1).optional(),
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

export const POST = authedRoute<{ id: string }, z.infer<typeof CreateQuoteSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreateQuoteSchema,
  handler: async ({ userId, params, body }) => {
    const project = await requireWorkspace(userId, params.id, { clientProfile: true }) as ClientWorkspace
    if (!project.clientProfile) return badRequest('Client project not found')

    const { jobId, title, templateId } = body

    const job = await prisma.job.findFirst({
      where: { id: jobId, clientProfile: { workspace: { id: params.id, userId } } },
    })
    if (!job) return badRequest('Job not found')

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

    // Template path
    if (templateId) {
      const template = await prisma.quoteTemplate.findFirst({
        where: { id: templateId, userId },
      })
      if (!template) return badRequest('Template not found')

      const sections = template.sections as { name: string; items: { description: string; unit?: string | null; quantity: number; rate?: number | null; costRate?: number | null; tags?: string[]; isOptional?: boolean }[]; sortOrder?: number }[]

      const sectionData = sections.map((s, si) => {
        const items = s.items.map((item, ii) => {
          const costRate = item.costRate ?? null
          const tags = item.tags ?? []
          const priceManual = item.rate != null
          const unitPrice = item.rate ?? (costRate != null ? autoPrice(costRate, tags, marginByTag) : 0)
          return {
            description: item.description,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? null,
            unitPrice,
            costRate,
            tags,
            isOptional: item.isOptional ?? false,
            priceManual,
            sortOrder: ii,
          }
        })
        return { name: s.name, sortOrder: s.sortOrder ?? si, items }
      })

      const allItems = sectionData.flatMap(s => s.items.map(i => ({ quantity: i.quantity, unitPrice: i.unitPrice, costRate: i.costRate, isOptional: i.isOptional })))
      const totals = quoteTotals(allItems)

      const quote = await prisma.quote.create({
        data: {
          jobId,
          clientProfileId: project.clientProfile.id,
          quoteNumber,
          title: title ?? template.name,
          currency: project.clientProfile.currency ?? 'USD',
          validUntil,
          terms: defaultTerms,
          totalCost: totals.totalCost || null,
          totalQuoted: totals.totalQuoted || null,
          sections: {
            create: sectionData.map(s => ({
              name: s.name,
              sortOrder: s.sortOrder,
              items: { create: s.items },
            })),
          },
        },
        include: {
          sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
          job: { select: { id: true, name: true } },
        },
      })

      await prisma.quoteTemplate.update({ where: { id: templateId }, data: { usageCount: { increment: 1 } } })

      return created(JSON.parse(JSON.stringify(quote)))
    }

    // Blank path
    const quote = await prisma.quote.create({
      data: {
        jobId,
        clientProfileId: project.clientProfile.id,
        quoteNumber,
        title: title ?? 'Untitled Quote',
        currency: project.clientProfile.currency ?? 'USD',
        validUntil,
        terms: defaultTerms,
        sections: {
          create: [{ name: 'Services', sortOrder: 0 }],
        },
      },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        job: { select: { id: true, name: true } },
      },
    })

    return created(JSON.parse(JSON.stringify(quote)))
  },
})

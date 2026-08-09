import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireQuote } from '@/lib/authz'
import { toDisplay } from '@/lib/money'

const ParamsSchema = z.object({ id: z.string().uuid(), quoteId: z.string() })

const CreateInvoiceFromQuoteSchema = z.object({
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().optional().nullable(),
  includeItemIds: z.array(z.string()).optional(),
  milestoneLabel: z.string().optional(),
  milestonePercent: z.number().min(1).max(100).optional(),
})

export const POST = authedRoute<{ id: string; quoteId: string }, z.infer<typeof CreateInvoiceFromQuoteSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreateInvoiceFromQuoteSchema,
  handler: async ({ userId, params, body }) => {
    const quote = await requireQuote(userId, params.quoteId, params.id)

    const full = await prisma.quote.findFirst({
      where: { id: params.quoteId },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        clientProfile: { select: { id: true, currency: true } },
        job: { select: { id: true } },
      },
    })
    if (!full) return badRequest('Quote not found')
    if (full.status !== 'ACCEPTED' && full.status !== 'AMENDED') {
      return badRequest('Quote must be accepted before creating an invoice')
    }

    const { dueDate, notes, includeItemIds, milestoneLabel, milestonePercent } = body

    const invoiceCount = await prisma.invoice.count({
      where: { clientProfile: { workspace: { userId } } },
    })
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(4, '0')}`

    const allItems = full.sections.flatMap(s =>
      s.items
        .filter(i => !i.isOptional || (includeItemIds?.includes(i.id)))
        .filter(i => !includeItemIds || includeItemIds.includes(i.id))
        .map(i => ({
          description: i.description,
          quantity: toDisplay(i.quantity),
          unitPrice: toDisplay(i.unitPrice),
          qtyUnit: i.unit ?? null,
          isTaxLine: false as const,
        }))
    )

    let lineItems = allItems
    if (milestonePercent !== undefined && milestoneLabel) {
      const totalQuoted = allItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
      const milestoneAmount = totalQuoted * milestonePercent / 100
      lineItems = [{
        description: `${milestoneLabel} — ${milestonePercent}% of ${full.quoteNumber}`,
        quantity: 1,
        unitPrice: Math.round(milestoneAmount * 100) / 100,
        qtyUnit: null,
        isTaxLine: false,
      }]
    }

    if (lineItems.length === 0) {
      return badRequest('No line items to invoice')
    }

    // Partial milestone invoices keep the quote ACCEPTED so the remaining
    // balance can still be invoiced; anything else fully converts the quote.
    const isPartialMilestone = milestonePercent !== undefined && milestonePercent < 100

    const invoice = await prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          clientProfileId: full.clientProfileId,
          jobId: full.jobId,
          quoteId: full.id,
          invoiceNumber,
          dueDate: new Date(dueDate),
          currency: full.currency,
          notes: notes ?? `Invoice for ${full.quoteNumber} — ${full.title}`,
          lineItems: {
            create: lineItems,
          },
        },
        include: { lineItems: true },
      })

      if (!isPartialMilestone) {
        await tx.quote.update({
          where: { id: full.id },
          data: { status: 'INVOICED' },
        })
      }

      return newInvoice
    })

    return created(JSON.parse(JSON.stringify(invoice)))
  },
})

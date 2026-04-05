import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

const CreateInvoiceFromQuoteSchema = z.object({
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().optional().nullable(),
  // Optionally override which line items to include (if not provided, all non-optional are included)
  includeItemIds: z.array(z.string()).optional(),
  // Optional partial amount (e.g. 30% upfront milestone)
  milestoneLabel: z.string().optional(),
  milestonePercent: z.number().min(1).max(100).optional(),
})

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfile: { workspace: { id, userId } } },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        clientProfile: { select: { id: true, currency: true } },
        job: { select: { id: true } },
      },
    })
    if (!quote) return notFound('Quote not found')
    if (quote.status !== 'ACCEPTED' && quote.status !== 'AMENDED') {
      return badRequest('Quote must be accepted before creating an invoice')
    }

    const body = await request.json()
    const parsed = CreateInvoiceFromQuoteSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { dueDate, notes, includeItemIds, milestoneLabel, milestonePercent } = parsed.data

    // Generate invoice number
    const invoiceCount = await prisma.invoice.count({
      where: { clientProfile: { workspace: { userId } } },
    })
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(4, '0')}`

    // Build line items from quote
    const allItems = quote.sections.flatMap(s =>
      s.items
        .filter(i => !i.isOptional || (includeItemIds?.includes(i.id)))
        .filter(i => !includeItemIds || includeItemIds.includes(i.id))
        .map(i => ({
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          isTaxLine: false as const,
        }))
    )

    // Apply milestone percentage if specified
    let lineItems = allItems
    if (milestonePercent !== undefined && milestoneLabel) {
      const totalQuoted = allItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
      const milestoneAmount = totalQuoted * milestonePercent / 100
      lineItems = [{
        description: `${milestoneLabel} — ${milestonePercent}% of ${quote.quoteNumber}`,
        quantity: 1,
        unitPrice: Math.round(milestoneAmount * 100) / 100,
        isTaxLine: false,
      }]
    }

    if (lineItems.length === 0) {
      return badRequest('No line items to invoice')
    }

    const invoice = await prisma.invoice.create({
      data: {
        clientProfileId: quote.clientProfileId,
        jobId: quote.jobId,
        quoteId,
        invoiceNumber,
        dueDate: new Date(dueDate),
        currency: quote.currency,
        notes: notes ?? `Invoice for ${quote.quoteNumber} — ${quote.title}`,
        lineItems: {
          create: lineItems,
        },
      },
      include: { lineItems: true },
    })

    return created(JSON.parse(JSON.stringify(invoice)))
  } catch (e) {
    console.error('[quote create-invoice]', e)
    return serverError()
  }
}

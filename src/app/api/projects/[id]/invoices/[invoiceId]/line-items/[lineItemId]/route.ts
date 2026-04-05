import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { recalcInvoiceStatus } from '@/lib/invoice-status'

interface RouteParams { params: Promise<{ id: string; invoiceId: string; lineItemId: string }> }

const ForgivePatchSchema = z.object({
  action: z.literal('forgive'),
  reason: z.string().max(500).optional(),
})
const UnforgivePatchSchema = z.object({
  action: z.literal('unforgive'),
})
const PatchSchema = z.discriminatedUnion('action', [ForgivePatchSchema, UnforgivePatchSchema])

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId, lineItemId } = await params

    // Verify the invoice belongs to this user's project
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        OR: [
          { clientProfile: { workspace: { id, userId } } },
          { lease: { unit: { propertyProfile: { workspace: { id, userId } } } } },
          { tenant: { userId, leases: { some: { unit: { propertyProfile: { workspace: { id, userId } } } } } } },
          { applicant: { propertyProfile: { workspace: { id, userId } } } },
        ],
      },
      include: { lineItems: true },
    })
    if (!invoice) return notFound('Invoice not found')
    if (invoice.status === 'VOID') return badRequest('Cannot modify line items on a voided invoice')

    const lineItem = invoice.lineItems.find(li => li.id === lineItemId)
    if (!lineItem) return notFound('Line item not found')

    const body = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    if (parsed.data.action === 'forgive') {
      if (lineItem.forgivenAt) return badRequest('Line item is already forgiven')

      await prisma.invoiceLineItem.update({
        where: { id: lineItemId },
        data: {
          forgivenAt: new Date(),
          forgivenBy: userId,
          forgivenReason: parsed.data.reason ?? null,
        },
      })
    } else {
      if (!lineItem.forgivenAt) return badRequest('Line item is not forgiven')

      await prisma.invoiceLineItem.update({
        where: { id: lineItemId },
        data: { forgivenAt: null, forgivenBy: null, forgivenReason: null },
      })
    }

    // If all line items are now forgiven, set invoice to VOID
    const updatedLineItems = await prisma.invoiceLineItem.findMany({ where: { invoiceId } })
    const allForgiven = updatedLineItems.every(li => li.forgivenAt !== null)
    if (allForgiven) {
      await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'VOID' } })
    } else {
      await recalcInvoiceStatus(invoiceId)
    }

    return ok({ id: lineItemId, action: parsed.data.action })
  } catch {
    return serverError('Failed to update line item')
  }
}

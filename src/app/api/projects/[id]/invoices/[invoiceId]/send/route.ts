import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { sendInvoiceEmail } from '@/lib/email'

interface RouteParams { params: Promise<{ id: string; invoiceId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clientProfile: { project: { id, userId } },
      },
      include: {
        clientProfile: {
          include: { project: { select: { name: true, slug: true } } },
        },
        lineItems: true,
        payments: true,
      },
    })

    if (!invoice) return notFound('Invoice not found')
    if (invoice.status === 'VOID') return badRequest('Cannot send a voided invoice')
    if (invoice.status === 'PAID') return badRequest('Invoice is already paid')

    const email = invoice.clientProfile.email
    if (!email) return badRequest('Client has no email address on file')

    const total = invoice.lineItems.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
      0,
    )

    await sendInvoiceEmail({
      toEmail: email,
      toName: invoice.clientProfile.contactName ?? invoice.clientProfile.project.name,
      fromName: invoice.clientProfile.project.name,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      projectSlug: invoice.clientProfile.project.slug,
      total,
      currency: invoice.currency,
      dueDate: invoice.dueDate.toISOString(),
      notes: invoice.notes,
    })

    // Transition DRAFT → SENT (don't downgrade PARTIAL/PAID)
    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: invoice.status === 'DRAFT' ? 'SENT' : undefined,
      },
    })

    return ok({ sent: true, status: updated.status })
  } catch {
    return serverError('Failed to send invoice')
  }
}

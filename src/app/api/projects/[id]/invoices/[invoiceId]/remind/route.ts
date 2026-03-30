import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { sendReminderEmail } from '@/lib/email'

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
    if (invoice.status === 'VOID') return badRequest('Cannot remind on a voided invoice')
    if (invoice.status === 'PAID') return badRequest('Invoice is already paid')
    if (invoice.status === 'DRAFT') return badRequest('Send the invoice before sending a reminder')

    const email = invoice.clientProfile.email
    if (!email) return badRequest('Client has no email address on file')

    const total = invoice.lineItems.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
      0,
    )
    const totalPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0)
    const balance = total - totalPaid
    const isOverdue = new Date(invoice.dueDate) < new Date()

    await sendReminderEmail({
      toEmail: email,
      toName: invoice.clientProfile.contactName ?? invoice.clientProfile.project.name,
      fromName: invoice.clientProfile.project.name,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      projectSlug: invoice.clientProfile.project.slug,
      balance,
      currency: invoice.currency,
      dueDate: invoice.dueDate.toISOString(),
      isOverdue,
    })

    return ok({ sent: true, isOverdue })
  } catch {
    return serverError('Failed to send reminder')
  }
}

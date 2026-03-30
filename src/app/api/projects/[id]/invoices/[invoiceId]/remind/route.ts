import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { sendReminderEmail } from '@/lib/email'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

interface RouteParams { params: Promise<{ id: string; invoiceId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const body = await request.json().catch(() => ({}))
    const message: string | undefined = body.message

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, clientProfile: { project: { id, userId } } },
      include: {
        clientProfile: { include: { project: { select: { name: true, slug: true } } } },
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

    // Load user payment methods
    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const paymentMethods = ((prefs?.data as Record<string, unknown>)?.paymentMethods ?? {}) as PaymentMethods

    const total = invoice.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
    const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)
    const balance = total - totalPaid
    const isOverdue = new Date(invoice.dueDate) < new Date()
    const clientName = invoice.clientProfile.contactName ?? invoice.clientProfile.project.name
    const projectName = invoice.clientProfile.project.name

    // Attach a fresh PDF with the reminder
    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      currency: invoice.currency,
      notes: invoice.notes,
      clientName,
      clientEmail: email,
      fromName: projectName,
      lineItems: invoice.lineItems.map(i => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        isTaxLine: i.isTaxLine,
      })),
    }, paymentMethods)

    await sendReminderEmail({
      toEmail: email,
      toName: clientName,
      fromName: projectName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      projectSlug: invoice.clientProfile.project.slug,
      balance,
      currency: invoice.currency,
      dueDate: invoice.dueDate.toISOString(),
      isOverdue,
      message,
      paymentMethods,
      pdfBuffer,
    })

    return ok({ sent: true, isOverdue })
  } catch (err) {
    console.error('[remind-invoice]', err)
    return serverError('Failed to send reminder')
  }
}

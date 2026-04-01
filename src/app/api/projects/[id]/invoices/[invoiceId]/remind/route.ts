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
      where: {
        id: invoiceId,
        OR: [
          { clientProfile: { project: { id, userId } } },
          { lease: { unit: { propertyProfile: { project: { id, userId } } } } },
          { tenant: { userId, leases: { some: { unit: { propertyProfile: { project: { id, userId } } } } } } },
        ],
      },
      include: {
        clientProfile: { select: { email: true, contactName: true, phone: true, address: true, project: { select: { name: true, slug: true } } } },
        tenant: { select: { id: true, name: true, email: true, phone: true } },
        lease: { include: { unit: true, tenant: { select: { name: true, email: true, phone: true } } } },
        lineItems: true,
        payments: { orderBy: { paidDate: 'asc' } },
      },
    })

    if (!invoice) return notFound('Invoice not found')
    if (invoice.status === 'VOID') return badRequest('Cannot remind on a voided invoice')
    if (invoice.status === 'PAID') return badRequest('Invoice is already paid')
    if (invoice.status === 'DRAFT') return badRequest('Send the invoice before sending a reminder')

    const cp = invoice.clientProfile
    const leaseTenant = invoice.lease?.tenant
    const directTenant = invoice.tenant
    const email = cp?.email ?? leaseTenant?.email ?? directTenant?.email
    if (!email) return badRequest('No email address found for this invoice recipient')

    const recipientName = cp?.contactName ?? cp?.project.name ?? leaseTenant?.name ?? directTenant?.name ?? 'Tenant'
    const clientPhone = cp?.phone ?? leaseTenant?.phone ?? directTenant?.phone
    const clientAddress = cp?.address ?? null

    // Load user payment methods + business profile
    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
    const paymentMethods = (prefsData.paymentMethods ?? {}) as PaymentMethods
    const invoicePaymentNote = prefsData.invoicePaymentNote as string | undefined
    const fromName = (prefsData.businessName as string) || (prefsData.yourName as string) || cp?.project.name || 'Invoice'

    const total = invoice.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
    const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)
    const balance = total - totalPaid
    const isOverdue = new Date(invoice.dueDate) < new Date()

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      currency: invoice.currency,
      notes: invoice.notes,
      clientName: recipientName,
      clientEmail: email,
      clientPhone: clientPhone ?? undefined,
      clientAddress: clientAddress ?? undefined,
      fromName,
      lineItems: invoice.lineItems.map(i => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        isTaxLine: i.isTaxLine,
      })),
      totalPaid,
      payments: invoice.payments.map(p => ({
        amount: Number(p.amount),
        paidDate: p.paidDate.toISOString(),
        paymentMethod: p.paymentMethod,
      })),
    }, paymentMethods, invoicePaymentNote)

    await sendReminderEmail({
      toEmail: email,
      toName: recipientName,
      fromName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      projectSlug: cp?.project.slug ?? id,
      balance,
      currency: invoice.currency,
      dueDate: invoice.dueDate.toISOString(),
      isOverdue,
      message,
      paymentMethods,
      paymentNote: invoicePaymentNote,
      pdfBuffer,
    })

    return ok({ sent: true, isOverdue })
  } catch (err) {
    console.error('[remind-invoice]', err)
    return serverError('Failed to send reminder')
  }
}

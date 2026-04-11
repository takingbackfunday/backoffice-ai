import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { sendInvoiceEmail } from '@/lib/email'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import { parsePreferences } from '@/types/preferences'

interface RouteParams { params: Promise<{ id: string; invoiceId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const body = await request.json().catch(() => ({}))
    const message: string | undefined = body.message

    // Look up invoice — could be CLIENT (via clientProfile) or PROPERTY (via lease/tenant)
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        OR: [
          { clientProfile: { workspace: { id, userId } } },
          { lease: { unit: { propertyProfile: { workspace: { id, userId } } } } },
          { tenant: { userId, leases: { some: { unit: { propertyProfile: { workspace: { id, userId } } } } } } },
        ],
      },
      include: {
        clientProfile: { select: { email: true, contactName: true, phone: true, address: true, workspace: { select: { name: true, slug: true } } } },
        tenant: { select: { id: true, name: true, email: true, phone: true } },
        lease: { include: { unit: true, tenant: { select: { name: true, email: true, phone: true } } } },
        lineItems: true,
        payments: { orderBy: { paidDate: 'asc' } },
      },
    })

    if (!invoice) return notFound('Invoice not found')
    if (invoice.status === 'VOID') return badRequest('Cannot send a voided invoice')
    if (invoice.status === 'PAID') return badRequest('Invoice is already paid')

    // Determine recipient: CLIENT → clientProfile, PROPERTY → tenant on lease or direct tenant
    const cp = invoice.clientProfile
    const leaseTenant = invoice.lease?.tenant
    const directTenant = invoice.tenant
    const email = cp?.email ?? leaseTenant?.email ?? directTenant?.email
    if (!email) return badRequest('No email address found for this invoice recipient')

    const recipientName = cp?.contactName ?? cp?.workspace.name ?? leaseTenant?.name ?? directTenant?.name ?? 'Tenant'
    const clientPhone = cp?.phone ?? leaseTenant?.phone ?? directTenant?.phone
    const clientAddress = cp?.address ?? null

    // Load user payment methods + business profile
    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = parsePreferences(prefs?.data)
    const paymentMethods = prefsData.paymentMethods ?? {}
    const invoicePaymentNote = prefsData.invoicePaymentNote
    const fromName = prefsData.businessName || prefsData.yourName || cp?.workspace.name || 'Invoice'

    const total = invoice.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
    const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)

    // Generate PDF
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
      fromEmail: prefsData.fromEmail,
      fromPhone: prefsData.fromPhone,
      fromAddress: prefsData.fromAddress,
      fromVatNumber: prefsData.fromVatNumber,
      fromWebsite: prefsData.fromWebsite,
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

    await sendInvoiceEmail({
      toEmail: email,
      toName: recipientName,
      fromName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      projectSlug: cp?.workspace.slug ?? id,
      total,
      currency: invoice.currency,
      dueDate: invoice.dueDate.toISOString(),
      notes: invoice.notes,
      message,
      paymentMethods,
      paymentNote: invoicePaymentNote,
      pdfBuffer,
    })

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: invoice.status === 'DRAFT' ? 'SENT' : undefined },
    })

    return ok({ sent: true, status: updated.status })
  } catch (err) {
    console.error('[send-invoice]', err)
    return serverError('Failed to send invoice')
  }
}

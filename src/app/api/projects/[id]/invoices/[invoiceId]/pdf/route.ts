import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { unauthorized, notFound, serverError } from '@/lib/api-response'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

interface RouteParams { params: Promise<{ id: string; invoiceId: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

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
        clientProfile: { include: { workspace: { select: { name: true } } } },
        tenant: { select: { name: true, email: true, phone: true } },
        lease: { include: { tenant: { select: { name: true, email: true, phone: true } } } },
        lineItems: true,
        payments: { orderBy: { paidDate: 'asc' } },
      },
    })
    if (!invoice) return notFound('Invoice not found')

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
    const paymentMethods = (prefsData.paymentMethods ?? {}) as PaymentMethods
    const invoicePaymentNote = prefsData.invoicePaymentNote as string | undefined
    const cp = invoice.clientProfile
    const leaseTenant = invoice.lease?.tenant
    const directTenant = invoice.tenant
    const fromName = (prefsData.businessName as string) || (prefsData.yourName as string) || cp?.workspace.name || 'Invoice'
    const clientName = cp?.contactName ?? cp?.workspace.name ?? leaseTenant?.name ?? directTenant?.name ?? invoice.invoiceNumber
    const clientEmail = cp?.email ?? leaseTenant?.email ?? directTenant?.email
    const clientPhone = cp?.phone ?? leaseTenant?.phone ?? directTenant?.phone
    const clientAddress = cp?.address ?? null

    const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      currency: invoice.currency,
      notes: invoice.notes,
      clientName,
      clientEmail: clientEmail ?? undefined,
      clientPhone: clientPhone ?? undefined,
      clientAddress: clientAddress ?? undefined,
      fromName,
      fromEmail: prefsData.fromEmail as string | undefined,
      fromPhone: prefsData.fromPhone as string | undefined,
      fromAddress: prefsData.fromAddress as string | undefined,
      fromVatNumber: prefsData.fromVatNumber as string | undefined,
      fromWebsite: prefsData.fromWebsite as string | undefined,
      lineItems: invoice.lineItems.map(i => ({
        description: i.description,
        quantity: Number(i.quantity),
        qtyUnit: i.qtyUnit ?? undefined,
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

    const filename = `${invoice.invoiceNumber}.pdf`

    const uint8 = new Uint8Array(pdfBuffer)

    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(uint8.byteLength),
      },
    })
  } catch (err) {
    console.error('[invoice-pdf]', err)
    return serverError('Failed to generate PDF')
  }
}

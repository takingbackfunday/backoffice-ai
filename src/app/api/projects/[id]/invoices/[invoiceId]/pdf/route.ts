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
      where: { id: invoiceId, clientProfile: { project: { id, userId } } },
      include: {
        clientProfile: { include: { project: { select: { name: true } } } },
        lineItems: true,
      },
    })
    if (!invoice) return notFound('Invoice not found')

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
    const paymentMethods = (prefsData.paymentMethods ?? {}) as PaymentMethods
    const fromName = (prefsData.businessName as string) || (prefsData.yourName as string) || invoice.clientProfile.project.name
    const clientName = invoice.clientProfile.contactName ?? invoice.clientProfile.project.name

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      currency: invoice.currency,
      notes: invoice.notes,
      clientName,
      clientEmail: invoice.clientProfile.email ?? undefined,
      fromName,
      lineItems: invoice.lineItems.map(i => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        isTaxLine: i.isTaxLine,
      })),
    }, paymentMethods)

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

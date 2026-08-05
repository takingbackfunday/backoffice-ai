import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { sendInvoiceEmail } from '@/lib/email'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import { fetchImageAsDataUri } from '@/lib/pdf/fetch-image'
import { parsePreferences } from '@/types/preferences'
import { isInvoiceTemplateId } from '@/lib/pdf/invoice-templates'
import { computeInvoiceTotals, toDisplay } from '@/lib/money'
import { logger } from '@/lib/log'

interface RouteParams { params: Promise<{ id: string; invoiceId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const body = await request.json().catch(() => ({}))
    const message: string | undefined = body.message
    const receiptIds: string[] = Array.isArray(body.receiptIds) ? body.receiptIds : []

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
        clientProfile: { select: { email: true, contactName: true, company: true, phone: true, address: true, workspace: { select: { name: true, slug: true } } } },
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
    const logoDataUri = prefsData.logoUrl ? await fetchImageAsDataUri(prefsData.logoUrl) : null
    const fromName = prefsData.businessName || prefsData.yourName || cp?.workspace.name || 'Invoice'
    const template = isInvoiceTemplateId(prefsData.invoiceTemplate) ? prefsData.invoiceTemplate : 'top-left'
    const showBusinessName = prefsData.invoiceShowBusinessName !== false

    const { total, paid: totalPaid } = computeInvoiceTotals(invoice)

    // Generate PDF
    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      currency: invoice.currency,
      notes: invoice.notes,
      clientName: recipientName,
      clientCompany: cp?.company ?? undefined,
      clientEmail: email,
      clientPhone: clientPhone ?? undefined,
      clientAddress: clientAddress ?? undefined,
      fromName,
      fromEmail: prefsData.fromEmail,
      fromPhone: prefsData.fromPhone,
      fromAddress: prefsData.fromAddress,
      fromVatNumber: prefsData.fromVatNumber,
      fromWebsite: prefsData.fromWebsite,
      logoUrl: logoDataUri,
      template,
      showBusinessName,
      lineItems: invoice.lineItems.map(i => ({
        description: i.description,
        quantity: toDisplay(i.quantity),
        unitPrice: toDisplay(i.unitPrice),
        isTaxLine: i.isTaxLine,
      })),
      totalPaid: toDisplay(totalPaid),
      payments: invoice.payments.map(p => ({
        amount: toDisplay(p.amount),
        paidDate: p.paidDate.toISOString(),
        paymentMethod: p.paymentMethod,
      })),
    }, paymentMethods, invoicePaymentNote)

    // Fetch and attach selected receipts
    let receiptAttachments: { filename: string; content: string }[] = []
    if (receiptIds.length > 0) {
      const receipts = await prisma.receipt.findMany({
        where: { id: { in: receiptIds }, userId },
        select: { id: true, thumbnailUrl: true, extractedData: true },
      })
      const fetched = await Promise.allSettled(
        receipts
          .filter(r => r.thumbnailUrl)
          .map(async (r, i) => {
            const res = await fetch(r.thumbnailUrl!)
            if (!res.ok) return null
            const buf = Buffer.from(await res.arrayBuffer())
            const vendor = (r.extractedData as Record<string, unknown> | null)?.vendor
            const name = vendor ? `Receipt-${String(vendor).replace(/[^a-zA-Z0-9]/g, '_')}-${i + 1}.webp` : `Receipt-${i + 1}.webp`
            return { filename: name, content: buf.toString('base64') }
          })
      )
      receiptAttachments = fetched
        .filter((r): r is PromiseFulfilledResult<{ filename: string; content: string }> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value)
    }

    await sendInvoiceEmail({
      toEmail: email,
      toName: recipientName,
      fromName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      projectSlug: cp?.workspace.slug ?? id,
      total: toDisplay(total),
      currency: invoice.currency,
      dueDate: invoice.dueDate.toISOString(),
      notes: invoice.notes,
      message,
      paymentMethods,
      paymentNote: invoicePaymentNote,
      pdfBuffer,
      receiptAttachments,
    })

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: invoice.status === 'DRAFT' ? 'SENT' : undefined },
    })

    return ok({ sent: true, status: updated.status })
  } catch (err) {
    logger.error('invoice-send', 'POST error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to send invoice')
  }
}

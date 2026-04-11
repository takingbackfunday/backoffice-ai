import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { sendInvoiceEmail } from '@/lib/email'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import { parsePreferences } from '@/types/preferences'

interface RouteParams { params: Promise<{ id: string; applicantId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, applicantId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const applicant = await prisma.applicant.findFirst({
      where: { id: applicantId, propertyProfileId: project.propertyProfile.id },
    })
    if (!applicant) return notFound('Applicant not found')

    const invoice = await prisma.invoice.findFirst({
      where: { applicantId },
      include: { lineItems: true, payments: { orderBy: { paidDate: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })
    if (!invoice) return badRequest('No invoice found for this applicant')

    // Load user payment methods + business name from preferences (same as client invoice send)
    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = parsePreferences(prefs?.data)
    const paymentMethods = prefsData.paymentMethods ?? {}
    const invoicePaymentNote = prefsData.invoicePaymentNote
    const fromName = prefsData.businessName || prefsData.yourName || project.name

    const total = invoice.lineItems.reduce((s, li) => s + Number(li.unitPrice) * Number(li.quantity), 0)
    const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      currency: invoice.currency,
      notes: invoice.notes,
      clientName: applicant.name,
      clientEmail: applicant.email,
      clientPhone: applicant.phone ?? undefined,
      fromName,
      fromEmail: prefsData.fromEmail,
      fromPhone: prefsData.fromPhone,
      fromAddress: prefsData.fromAddress,
      fromVatNumber: prefsData.fromVatNumber,
      fromWebsite: prefsData.fromWebsite,
      lineItems: invoice.lineItems.map(li => ({
        description: li.description,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        isTaxLine: li.isTaxLine,
      })),
      totalPaid,
      payments: invoice.payments.map(p => ({
        amount: Number(p.amount),
        paidDate: p.paidDate.toISOString(),
        paymentMethod: p.paymentMethod,
      })),
    }, paymentMethods, invoicePaymentNote)

    await sendInvoiceEmail({
      toEmail: applicant.email,
      toName: applicant.name,
      fromName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      projectSlug: project.slug,
      total,
      currency: invoice.currency,
      dueDate: invoice.dueDate.toISOString(),
      notes: invoice.notes,
      paymentMethods,
      paymentNote: invoicePaymentNote,
      pdfBuffer,
    })

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'SENT', sentAt: new Date(), sentTo: applicant.email },
      include: { lineItems: true },
    })

    return ok(updated)
  } catch (err) {
    console.error('[applicant-send-invoice]', err)
    return serverError('Failed to send invoice')
  }
}

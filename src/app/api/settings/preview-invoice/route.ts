import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import { fetchImageAsDataUri } from '@/lib/pdf/fetch-image'
import { parsePreferences } from '@/types/preferences'
import { DEFAULT_INVOICE_TEMPLATE, isInvoiceTemplateId } from '@/lib/pdf/invoice-templates'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    paymentMethods?: PaymentMethods
    businessName?: string
    yourName?: string
    logoUrl?: string | null
    invoicePaymentNote?: string
    invoiceTemplate?: string
    invoiceShowBusinessName?: boolean
    invoiceNotesDefault?: string | null
    fromEmail?: string
    fromPhone?: string
    fromAddress?: string
    fromVatNumber?: string
    fromWebsite?: string
  }

  const fromName = body.businessName || body.yourName || 'Your Business Name'

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const prefsData = parsePreferences(prefs?.data)

  const logoUrl = body.logoUrl === undefined ? prefsData.logoUrl : body.logoUrl
  let logoDataUri: string | null = null
  if (logoUrl) {
    try {
      logoDataUri = await fetchImageAsDataUri(logoUrl)
    } catch {
      logoDataUri = null
    }
  }

  const template = body.invoiceTemplate !== undefined
    ? (isInvoiceTemplateId(body.invoiceTemplate) ? body.invoiceTemplate : DEFAULT_INVOICE_TEMPLATE)
    : (isInvoiceTemplateId(prefsData.invoiceTemplate) ? prefsData.invoiceTemplate : DEFAULT_INVOICE_TEMPLATE)

  const showBusinessName = body.invoiceShowBusinessName ?? prefsData.invoiceShowBusinessName ?? true

  const notes = (body.invoiceNotesDefault ?? prefsData.invoiceNotesDefault) || 'Thank you for your business.'

  const currency = prefsData.invoiceDefaults?.currency ?? prefsData.dashboardCurrency ?? 'USD'

  const today = new Date()
  const due = new Date(today)
  due.setDate(due.getDate() + 30)

  const nameForInitials = body.businessName || body.yourName || ''
  const initials = nameForInitials
    ? nameForInitials.trim().split(/\s+/).map((w: string) => w[0].toUpperCase()).join('')
    : 'INV'
  const datePart = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`
  const previewInvoiceNumber = `${initials}_${datePart}_01`

  const pdfBuffer = await generateInvoicePdf(
    {
      invoiceNumber: previewInvoiceNumber,
      status: 'DRAFT',
      issueDate: today.toISOString(),
      dueDate: due.toISOString(),
      currency,
      fromName,
      fromEmail: body.fromEmail || undefined,
      fromPhone: body.fromPhone || undefined,
      fromAddress: body.fromAddress || undefined,
      fromVatNumber: body.fromVatNumber || undefined,
      fromWebsite: body.fromWebsite || undefined,
      logoUrl: logoDataUri,
      template,
      showBusinessName,
      clientName: 'Sample Client',
      clientCompany: 'Sample Co Ltd',
      clientEmail: 'client@example.com',
      clientAddress: '456 Client Ave, New York, NY 10001',
      clientPhone: '+1 555 000 0000',
      jobName: 'Website Redesign',
      notes,
      lineItems: [
        { description: 'Web Design', quantity: 1, unitPrice: 2500, qtyUnit: 'project' },
        { description: 'Development', quantity: 40, unitPrice: 75, qtyUnit: 'hrs' },
        { description: 'VAT (20%)', quantity: 1, unitPrice: 1100, isTaxLine: true },
      ],
      payments: [],
      totalPaid: 0,
    },
    body.paymentMethods,
    body.invoicePaymentNote,
  )

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="invoice-preview.pdf"',
    },
  })
}

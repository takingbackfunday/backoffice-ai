import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    paymentMethods?: PaymentMethods
    businessName?: string
    yourName?: string
    invoicePaymentNote?: string
    fromEmail?: string
    fromPhone?: string
    fromAddress?: string
    fromVatNumber?: string
    fromWebsite?: string
  }

  const fromName = body.businessName || body.yourName || 'Your Business Name'

  const today = new Date()
  const due = new Date(today)
  due.setDate(due.getDate() + 30)

  const pdfBuffer = await generateInvoicePdf(
    {
      invoiceNumber: 'INV-0001',
      status: 'DRAFT',
      issueDate: today.toISOString(),
      dueDate: due.toISOString(),
      currency: 'USD',
      fromName,
      fromEmail: body.fromEmail || undefined,
      fromPhone: body.fromPhone || undefined,
      fromAddress: body.fromAddress || undefined,
      fromVatNumber: body.fromVatNumber || undefined,
      fromWebsite: body.fromWebsite || undefined,
      clientName: 'Sample Client',
      clientCompany: 'Sample Co Ltd',
      clientEmail: 'client@example.com',
      clientAddress: '456 Client Ave, New York, NY 10001',
      clientPhone: '+1 555 000 0000',
      jobName: 'Website Redesign',
      notes: 'Thank you for your business.',
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

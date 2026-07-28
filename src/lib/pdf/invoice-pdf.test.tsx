import { describe, it, expect } from 'vitest'
import { generateInvoicePdf, type PdfInvoice, type PaymentMethods } from './invoice-pdf'

function makeInvoice(overrides: Partial<PdfInvoice> = {}): PdfInvoice {
  return {
    invoiceNumber: 'INV-001',
    status: 'SENT',
    issueDate: '2026-01-15',
    dueDate: '2026-02-15',
    currency: 'USD',
    clientName: 'Acme Corp',
    clientEmail: 'billing@acme.test',
    fromName: 'Studio One',
    fromEmail: 'hello@studioone.test',
    lineItems: [
      { description: 'Design services', quantity: 1, unitPrice: 1000, qtyUnit: 'hr' },
    ],
    ...overrides,
  }
}

function countPages(buffer: Buffer): number {
  const text = buffer.toString('binary')
  const matches = text.match(/\/Type\s*\/Page(?!s)/g)
  return matches?.length ?? 0
}

describe('generateInvoicePdf', () => {
  it('renders a minimal invoice as a valid PDF', async () => {
    const invoice = makeInvoice()
    const buffer = await generateInvoicePdf(invoice)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.toString('ascii', 0, 4)).toBe('%PDF')
    expect(countPages(buffer)).toBe(1)
  })

  it('renders a fully-paid invoice without error', async () => {
    const invoice = makeInvoice({
      lineItems: [{ description: 'Project fee', quantity: 1, unitPrice: 2500 }],
      payments: [{ amount: 2500, paidDate: '2026-01-20', paymentMethod: 'Bank transfer' }],
    })
    const buffer = await generateInvoicePdf(invoice)
    expect(buffer.toString('ascii', 0, 4)).toBe('%PDF')
    expect(countPages(buffer)).toBe(1)
  })

  it('renders a long invoice with notes and all payment methods across multiple pages', async () => {
    const lineItems = Array.from({ length: 80 }, (_, i) => ({
      description: `Line item ${i + 1} — comprehensive design and development work spanning multiple disciplines and deliverables`,
      quantity: 1,
      unitPrice: 150,
    }))

    const paymentMethods: PaymentMethods = {
      bankTransfer: {
        accountName: 'Studio One Ltd',
        bankName: 'International Bank',
        iban: 'GB82WEST12345698765432',
        swift: 'WESTGB2L',
        sortCode: '12-34-56',
        accountNumber: '12345678',
        routingNumber: '021000021',
      },
      paypal: { link: 'https://paypal.me/studioone' },
      stripe: { link: 'https://pay.studioone.test/inv-001' },
      custom: [
        { label: 'Wise', value: 'studio@wise.test' },
        { label: 'Crypto', value: '0x1234567890abcdef' },
      ],
    }

    const invoice = makeInvoice({
      lineItems,
      notes:
        'Thank you for your business. Please ensure payment reaches us by the due date to avoid late fees. ' +
        'For international transfers, allow 3-5 working days for clearance. Include the invoice number as the payment reference. ' +
        'If you have any questions, reply to this invoice or contact accounts@studioone.test.',
      invoicePaymentNote: 'Payments are non-refundable once work has commenced.',
    })

    const buffer = await generateInvoicePdf(invoice, paymentMethods)
    expect(buffer.toString('ascii', 0, 4)).toBe('%PDF')
    expect(countPages(buffer)).toBeGreaterThanOrEqual(2)
  })
})

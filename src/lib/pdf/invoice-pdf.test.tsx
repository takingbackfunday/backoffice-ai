import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
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
  const matches = text.match(/\/Type\s*\/Page\b(?!s)/g)
  return matches?.length ?? 0
}

/** Inflate every FlateDecode stream and decode […] TJ text ops (hex chunks → ASCII). */
function extractText(buffer: Buffer): string {
  const raw = buffer.toString('binary')
  let out = ''
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const end = raw.indexOf('endstream', m.index)
    if (end === -1) continue
    const chunk = Buffer.from(raw.slice(m.index + m[0].length, end), 'binary')
    try {
      out += zlib.inflateSync(chunk).toString('latin1') + '\n'
    } catch {
      /* not a flate stream */
    }
  }
  return out.replace(/\[(.*?)\]\s*TJ/gs, (_, inner: string) =>
    [...inner.matchAll(/<([0-9A-Fa-f]+)>/g)]
      .map(x => Buffer.from(x[1], 'hex').toString('latin1'))
      .join('') + '\n',
  )
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
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
    })

    const buffer = await generateInvoicePdf(invoice, paymentMethods, 'Payments are non-refundable once work has commenced.')
    expect(buffer.toString('ascii', 0, 4)).toBe('%PDF')
    expect(countPages(buffer)).toBeGreaterThanOrEqual(2)
  })

  it('single page: notes/how-to-pay flow below the totals (rendered once), page row pinned', async () => {
    const invoice = makeInvoice({
      notes: 'Thank you for your business.',
    })
    const pm: PaymentMethods = { bankTransfer: { accountName: 'Studio One Ltd', iban: 'GB82WEST12345698765432' } }
    const buffer = await generateInvoicePdf(invoice, pm, 'Ref: INV-001')
    expect(countPages(buffer)).toBe(1)
    const text = extractText(buffer)
    // In-flow footer renders the blocks exactly once — no doubling with the pinned footer.
    expect(occurrences(text, 'HOW TO PAY')).toBe(1)
    expect(occurrences(text, 'NOTES')).toBe(1)
    expect(occurrences(text, 'Page 1 of 1')).toBe(1)
  })

  it('borderline one-page invoice with notes and payment methods stays on one page', async () => {
    const lineItems = Array.from({ length: 20 }, (_, i) => ({
      description: `Item ${i + 1}`,
      quantity: 1,
      unitPrice: 100,
    }))
    const invoice = makeInvoice({
      lineItems,
      notes: 'Thank you for your business. Payment due within 14 days.',
    })
    const pm: PaymentMethods = {
      bankTransfer: { accountName: 'Studio One Ltd', iban: 'GB82WEST12345698765432' },
    }
    const buffer = await generateInvoicePdf(invoice, pm, 'Ref: INV-001')
    const text = extractText(buffer)
    expect(countPages(buffer)).toBe(1)
    expect(occurrences(text, 'HOW TO PAY')).toBe(1)
    expect(occurrences(text, 'NOTES')).toBe(1)
    expect(occurrences(text, 'Page 1 of 1')).toBe(1)
  })

  it('multi page: footer blocks appear once per page — pinned on 1..n-1, in-flow on the last', async () => {
    const lineItems = Array.from({ length: 80 }, (_, i) => ({
      description: `Line item ${i + 1} — comprehensive design and development work`,
      quantity: 1,
      unitPrice: 150,
    }))
    const invoice = makeInvoice({ lineItems, notes: 'Thank you for your business.' })
    const pm: PaymentMethods = { bankTransfer: { accountName: 'Studio One Ltd', iban: 'GB82WEST12345698765432' } }
    const buffer = await generateInvoicePdf(invoice, pm, 'Ref: INV-001')
    const pages = countPages(buffer)
    expect(pages).toBeGreaterThanOrEqual(2)
    const text = extractText(buffer)
    expect(occurrences(text, 'HOW TO PAY')).toBe(pages)
    expect(occurrences(text, `Page 1 of ${pages}`)).toBe(1)
    expect(occurrences(text, `Page ${pages} of ${pages}`)).toBe(1)
  })
})

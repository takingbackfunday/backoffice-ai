import { describe, it, expect } from 'vitest'
import { matchTransactionToInvoices, type OpenInvoice } from '@/lib/invoice-matching'

function makeInvoice(overrides: Partial<OpenInvoice> & { invoiceNumber: string }): OpenInvoice {
  return {
    id: `inv-${overrides.invoiceNumber}`,
    status: 'SENT',
    lineItems: [{ quantity: 1, unitPrice: 100 }],
    payments: [],
    ...overrides,
  }
}

describe('matchTransactionToInvoices', () => {
  const baseOpts = {
    userId: 'user-1',
    txId: 'tx-1',
    txDescription: 'Payment from customer',
    txNotes: null as string | null,
    alreadySuggestedIds: new Set<string>(),
  }

  it('returns empty for no open invoices', () => {
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 100,
      openInvoices: [],
    })
    expect(suggestions).toHaveLength(0)
  })

  it('creates MEDIUM suggestion for unmatched invoice', () => {
    const invoice = makeInvoice({ invoiceNumber: 'INV-001' })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 50,
      openInvoices: [invoice],
    })
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].confidence).toBe('medium')
    expect(suggestions[0].invoiceId).toBe('inv-INV-001')
    expect(suggestions[0].reasoning).toContain('under balance')
  })

  it('creates MEDIUM suggestion for overpayment', () => {
    const invoice = makeInvoice({ invoiceNumber: 'INV-001' })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 150,
      openInvoices: [invoice],
    })
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].reasoning).toContain('over balance')
  })

  it('returns empty for exact amount match (HIGH confidence)', () => {
    const invoice = makeInvoice({ invoiceNumber: 'INV-001', lineItems: [{ quantity: 1, unitPrice: 100 }] })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 100,
      openInvoices: [invoice],
    })
    expect(suggestions).toHaveLength(0) // caller will auto-apply
  })

  it('returns empty for invoice number in description (HIGH confidence)', () => {
    const invoice = makeInvoice({ invoiceNumber: 'INV-001' })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 50,
      txDescription: 'Payment for INV-001',
      openInvoices: [invoice],
    })
    expect(suggestions).toHaveLength(0) // caller will auto-apply
  })

  it('downgrades DRAFT invoice to MEDIUM even with exact match', () => {
    const invoice = makeInvoice({
      invoiceNumber: 'INV-001',
      status: 'DRAFT',
      lineItems: [{ quantity: 1, unitPrice: 100 }],
    })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 100,
      openInvoices: [invoice],
    })
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].confidence).toBe('medium')
    expect(suggestions[0].reasoning).toContain('draft invoice')
  })

  it('skips invoices already suggested', () => {
    const invoice = makeInvoice({ invoiceNumber: 'INV-001' })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 50,
      openInvoices: [invoice],
      alreadySuggestedIds: new Set(['inv-INV-001']),
    })
    expect(suggestions).toHaveLength(0)
  })

  it('creates multiple suggestions for multiple open invoices', () => {
    const inv1 = makeInvoice({ invoiceNumber: 'INV-001' })
    const inv2 = makeInvoice({ invoiceNumber: 'INV-002' })
    const inv3 = makeInvoice({ invoiceNumber: 'INV-003' })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 50,
      openInvoices: [inv1, inv2, inv3],
    })
    expect(suggestions).toHaveLength(3)
    expect(suggestions.map(s => s.invoiceId)).toEqual([
      'inv-INV-001',
      'inv-INV-002',
      'inv-INV-003',
    ])
  })

  it('handles partial payments correctly', () => {
    const invoice = makeInvoice({
      invoiceNumber: 'INV-001',
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [{ amount: 40 }],
    })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 30,
      openInvoices: [invoice],
    })
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].reasoning).toContain('under balance') // balance is 60
  })

  it('handles forgiven line items', () => {
    const invoice = makeInvoice({
      invoiceNumber: 'INV-001',
      lineItems: [
        { quantity: 1, unitPrice: 100 },
        { quantity: 1, unitPrice: 50, forgivenAt: new Date() },
      ],
    })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 100,
      openInvoices: [invoice],
    })
    expect(suggestions).toHaveLength(0) // exact match on total of 100
  })

  it('case-insensitive invoice number match', () => {
    const invoice = makeInvoice({ invoiceNumber: 'INV-001' })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 50,
      txDescription: 'payment for inv-001',
      openInvoices: [invoice],
    })
    expect(suggestions).toHaveLength(0) // HIGH confidence via invoice number
  })

  it('ignores invoice number match when amount does not match for HIGH', () => {
    // When invoice number is found but multiple exact matches exist, still goes to MEDIUM
    const inv1 = makeInvoice({ invoiceNumber: 'INV-001', lineItems: [{ quantity: 1, unitPrice: 100 }] })
    const inv2 = makeInvoice({ invoiceNumber: 'INV-002', lineItems: [{ quantity: 1, unitPrice: 100 }] })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 100,
      txDescription: 'Payment',
      openInvoices: [inv1, inv2],
    })
    // Two exact matches = no single HIGH confidence target
    expect(suggestions).toHaveLength(2)
  })

  it('reasoning includes amount details', () => {
    const invoice = makeInvoice({ invoiceNumber: 'INV-001' })
    const suggestions = matchTransactionToInvoices({
      ...baseOpts,
      txAmount: 75,
      openInvoices: [invoice],
    })
    expect(suggestions[0].reasoning).toContain('75.00')
    expect(suggestions[0].reasoning).toContain('25.00')
  })
})
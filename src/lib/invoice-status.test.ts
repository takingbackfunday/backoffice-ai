import { describe, it, expect } from 'vitest'
import { deriveInvoiceStatus } from '@/lib/invoice-status'
import { computeInvoiceTotals } from '@/lib/money'

describe('computeInvoiceTotals', () => {
  it('computes total from line items', () => {
    const invoice = {
      lineItems: [
        { quantity: 2, unitPrice: 50 },
        { quantity: 1, unitPrice: 100 },
      ],
      payments: [],
    }
    const { total, paid, balance } = computeInvoiceTotals(invoice)
    expect(total.toNumber()).toBe(200)
    expect(paid.toNumber()).toBe(0)
    expect(balance.toNumber()).toBe(200)
  })

  it('excludes forgiven line items', () => {
    const invoice = {
      lineItems: [
        { quantity: 1, unitPrice: 100 },
        { quantity: 1, unitPrice: 50, forgivenAt: new Date() },
      ],
      payments: [],
    }
    const { total } = computeInvoiceTotals(invoice)
    expect(total.toNumber()).toBe(100)
  })

  it('sums payments', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [
        { amount: 30 },
        { amount: 70 },
      ],
    }
    const { paid, balance } = computeInvoiceTotals(invoice)
    expect(paid.toNumber()).toBe(100)
    expect(balance.toNumber()).toBe(0)
  })

  it('excludes voided payments', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [
        { amount: 50 },
        { amount: 50, voidedAt: new Date() },
      ],
    }
    const { paid } = computeInvoiceTotals(invoice)
    expect(paid.toNumber()).toBe(50)
  })

  it('handles decimal quantities and prices', () => {
    const invoice = {
      lineItems: [{ quantity: 3, unitPrice: 0.1 }],
      payments: [],
    }
    const { total } = computeInvoiceTotals(invoice)
    expect(total.toNumber()).toBe(0.3)
  })

  it('handles empty line items and payments', () => {
    const invoice = { lineItems: [], payments: [] }
    const { total, paid, balance } = computeInvoiceTotals(invoice)
    expect(total.toNumber()).toBe(0)
    expect(paid.toNumber()).toBe(0)
    expect(balance.toNumber()).toBe(0)
  })

  it('handles null/undefined quantities and prices', () => {
    const invoice = {
      lineItems: [{ quantity: null, unitPrice: 100 }],
      payments: [],
    }
    const { total } = computeInvoiceTotals(invoice)
    expect(total.toNumber()).toBe(0)
  })
})

describe('deriveInvoiceStatus', () => {
  it('returns VOID for total <= 0', () => {
    const invoice = {
      lineItems: [{ quantity: 0, unitPrice: 0 }],
      payments: [],
      status: 'SENT' as const,
      dueDate: new Date('2024-12-31'),
    }
    expect(deriveInvoiceStatus(invoice)).toBe('VOID')
  })

  it('returns PAID when paid >= total', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [{ amount: 100 }],
      status: 'SENT' as const,
      dueDate: new Date('2024-12-31'),
    }
    expect(deriveInvoiceStatus(invoice)).toBe('PAID')
  })

  it('returns PARTIAL when paid > 0 but < total', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [{ amount: 50 }],
      status: 'SENT' as const,
      dueDate: new Date('2024-12-31'),
    }
    expect(deriveInvoiceStatus(invoice)).toBe('PARTIAL')
  })

  it('returns OVERDUE when due date is past and no payment', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [],
      status: 'SENT' as const,
      dueDate: new Date('2024-01-01'),
    }
    const now = new Date('2024-06-15')
    expect(deriveInvoiceStatus(invoice, now)).toBe('OVERDUE')
  })

  it('returns SENT when due date is future and no payment', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [],
      status: 'SENT' as const,
      dueDate: new Date('2025-12-31'),
    }
    const now = new Date('2024-06-15')
    expect(deriveInvoiceStatus(invoice, now)).toBe('SENT')
  })

  it('preserves DRAFT status', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [],
      status: 'DRAFT' as const,
      dueDate: new Date('2024-01-01'),
    }
    expect(deriveInvoiceStatus(invoice, new Date('2024-06-15'))).toBe('DRAFT')
  })

  it('preserves VOID status', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [{ amount: 100 }],
      status: 'VOID' as const,
      dueDate: new Date('2024-12-31'),
    }
    expect(deriveInvoiceStatus(invoice)).toBe('VOID')
  })

  it('handles string dueDate', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [],
      status: 'SENT' as const,
      dueDate: '2024-01-01',
    }
    const now = new Date('2024-06-15')
    expect(deriveInvoiceStatus(invoice, now)).toBe('OVERDUE')
  })

  it('handles null dueDate', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [],
      status: 'SENT' as const,
      dueDate: null,
    }
    expect(deriveInvoiceStatus(invoice)).toBe('SENT')
  })

  it('uses date-only comparison (ignores time)', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [],
      status: 'SENT' as const,
      dueDate: '2024-06-15',
    }
    // Due date is today at midnight, now is 11:59 PM — should still be SENT
    const now = new Date('2024-06-15T23:59:59Z')
    expect(deriveInvoiceStatus(invoice, now)).toBe('SENT')
  })

  it('transitions to OVERDUE the day after due date', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [],
      status: 'SENT' as const,
      dueDate: '2024-06-15',
    }
    const now = new Date('2024-06-16T00:00:01Z')
    expect(deriveInvoiceStatus(invoice, now)).toBe('OVERDUE')
  })

  it('exceeds total (overpayment) still returns PAID', () => {
    const invoice = {
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [{ amount: 150 }],
      status: 'SENT' as const,
      dueDate: new Date('2024-12-31'),
    }
    expect(deriveInvoiceStatus(invoice)).toBe('PAID')
  })
})
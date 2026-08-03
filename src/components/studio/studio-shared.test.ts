import { describe, it, expect } from 'vitest'
import { clientMatchesFilter, getDisplayStatus } from './studio-shared'
import type { Client, FlatInvoice, FlatQuote } from './studio-shared'

const baseClient: Pick<Client, 'id' | 'clientProfileId'> = {
  id: 'workspace-1',
  clientProfileId: 'cp-1',
}

const today = new Date()
const thirtyOneDaysAgo = new Date(today.getTime() - 31 * 86400000).toISOString().split('T')[0]
const twentyNineDaysAgo = new Date(today.getTime() - 29 * 86400000).toISOString().split('T')[0]

function flatInvoice(overrides: Partial<FlatInvoice> = {}): FlatInvoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    status: 'SENT',
    issueDate: '2026-01-15',
    dueDate: '2026-02-15',
    currency: 'USD',
    total: 100,
    paid: 0,
    jobName: null,
    clientId: 'workspace-1',
    clientProfileId: 'cp-1',
    clientName: 'Client',
    clientSlug: 'client',
    clientCompany: null,
    ...overrides,
  }
}

function flatQuote(overrides: Partial<FlatQuote> = {}): FlatQuote {
  return {
    id: 'q-1',
    quoteNumber: 'QTE-001',
    title: 'Website redesign',
    totalQuoted: 500,
    currency: 'USD',
    status: 'SENT',
    sentAt: '2026-01-15',
    hasInvoice: false,
    jobName: null,
    clientProfileId: 'cp-1',
    clientName: 'Client',
    clientSlug: 'client',
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/*  outstanding                                                        */
/* ------------------------------------------------------------------ */
describe('outstanding', () => {
  it('matches a client with a SENT invoice (not past due)', () => {
    expect(clientMatchesFilter(baseClient, 'outstanding', [flatInvoice({ status: 'SENT', dueDate: '2099-01-01' })], [])).toBe(true)
  })

  it('matches a client with a PARTIAL invoice', () => {
    expect(clientMatchesFilter(baseClient, 'outstanding', [flatInvoice({ status: 'PARTIAL' })], [])).toBe(true)
  })

  it('does NOT match a client with only a PAID invoice', () => {
    expect(clientMatchesFilter(baseClient, 'outstanding', [flatInvoice({ status: 'PAID' })], [])).toBe(false)
  })

  it('does NOT match a client with only an OVERDUE invoice', () => {
    const inv = flatInvoice({ status: 'SENT', dueDate: '2025-01-01' })
    expect(clientMatchesFilter(baseClient, 'outstanding', [inv], [])).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  overdue                                                            */
/* ------------------------------------------------------------------ */
describe('overdue', () => {
  it('matches a client with an OVERDUE invoice (SENT + past due date)', () => {
    const inv = flatInvoice({ status: 'SENT', dueDate: '2025-01-01' })
    expect(getDisplayStatus(inv)).toBe('OVERDUE')
    expect(clientMatchesFilter(baseClient, 'overdue', [inv], [])).toBe(true)
  })

  it('matches a client with a status=OVERDUE invoice', () => {
    expect(clientMatchesFilter(baseClient, 'overdue', [flatInvoice({ status: 'OVERDUE' })], [])).toBe(true)
  })

  it('does NOT match a client with a SENT invoice that is not past due', () => {
    const inv = flatInvoice({ status: 'SENT', dueDate: '2099-01-01' })
    expect(getDisplayStatus(inv)).toBe('SENT')
    expect(clientMatchesFilter(baseClient, 'overdue', [inv], [])).toBe(false)
  })

  it('does NOT match a client with only a PAID invoice', () => {
    expect(clientMatchesFilter(baseClient, 'overdue', [flatInvoice({ status: 'PAID' })], [])).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  unsent                                                             */
/* ------------------------------------------------------------------ */
describe('unsent', () => {
  it('matches a client with a DRAFT invoice', () => {
    expect(clientMatchesFilter(baseClient, 'unsent', [flatInvoice({ status: 'DRAFT' })], [])).toBe(true)
  })

  it('does NOT match a client with only SENT invoices', () => {
    expect(clientMatchesFilter(baseClient, 'unsent', [flatInvoice({ status: 'SENT' })], [])).toBe(false)
  })

  it('does NOT match a client with no invoices', () => {
    expect(clientMatchesFilter(baseClient, 'unsent', [], [])).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  collected — 30-day window                                          */
/* ------------------------------------------------------------------ */
describe('collected', () => {
  it('matches a PAID invoice with issueDate 29 days ago', () => {
    expect(clientMatchesFilter(baseClient, 'collected', [flatInvoice({ status: 'PAID', issueDate: twentyNineDaysAgo })], [])).toBe(true)
  })

  it('does NOT match a PAID invoice with issueDate 31 days ago', () => {
    expect(clientMatchesFilter(baseClient, 'collected', [flatInvoice({ status: 'PAID', issueDate: thirtyOneDaysAgo })], [])).toBe(false)
  })

  it('does NOT match a non-PAID invoice even if recent', () => {
    expect(clientMatchesFilter(baseClient, 'collected', [flatInvoice({ status: 'SENT', issueDate: twentyNineDaysAgo })], [])).toBe(false)
  })

  it('does NOT match an old PAID invoice', () => {
    expect(clientMatchesFilter(baseClient, 'collected', [flatInvoice({ status: 'PAID', issueDate: '2024-01-01' })], [])).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  awaiting-quotes — keyed on clientProfileId                         */
/* ------------------------------------------------------------------ */
describe('awaiting-quotes', () => {
  it('matches a client with a SENT quote on their clientProfileId', () => {
    expect(clientMatchesFilter(baseClient, 'awaiting-quotes', [], [flatQuote({ status: 'SENT' })])).toBe(true)
  })

  it('does NOT match a quote on a different clientProfileId', () => {
    expect(clientMatchesFilter(baseClient, 'awaiting-quotes', [], [flatQuote({ clientProfileId: 'cp-999', status: 'SENT' })])).toBe(false)
  })

  it('does NOT match an ACCEPTED quote', () => {
    expect(clientMatchesFilter(baseClient, 'awaiting-quotes', [], [flatQuote({ status: 'ACCEPTED' })])).toBe(false)
  })

  it('does NOT match when there are no quotes', () => {
    expect(clientMatchesFilter(baseClient, 'awaiting-quotes', [], [])).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  uninvoiced-quotes — keyed on clientProfileId                       */
/* ------------------------------------------------------------------ */
describe('uninvoiced-quotes', () => {
  it('matches a client with an ACCEPTED quote without hasInvoice', () => {
    expect(clientMatchesFilter(baseClient, 'uninvoiced-quotes', [], [flatQuote({ status: 'ACCEPTED', hasInvoice: false })])).toBe(true)
  })

  it('does NOT match a client whose ACCEPTED quote already has an invoice', () => {
    expect(clientMatchesFilter(baseClient, 'uninvoiced-quotes', [], [flatQuote({ status: 'ACCEPTED', hasInvoice: true })])).toBe(false)
  })

  it('does NOT match a SENT quote', () => {
    expect(clientMatchesFilter(baseClient, 'uninvoiced-quotes', [], [flatQuote({ status: 'SENT' })])).toBe(false)
  })

  it('does NOT match a quote on a different clientProfileId', () => {
    expect(clientMatchesFilter(baseClient, 'uninvoiced-quotes', [], [flatQuote({ clientProfileId: 'cp-999', status: 'ACCEPTED', hasInvoice: false })])).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  Cross-client — invoices keyed on id (workspace), not clientProfileId */
/* ------------------------------------------------------------------ */
describe('keying: invoices on client.id (workspace), quotes on clientProfileId', () => {
  it('finds own invoices by client.id, not another workspace', () => {
    const inv = flatInvoice({ clientId: 'workspace-3' })
    expect(clientMatchesFilter(baseClient, 'unsent', [inv], [])).toBe(false)
  })

  it('finds own quotes by clientProfileId, not another profile', () => {
    const q = flatQuote({ clientProfileId: 'cp-999', status: 'SENT' })
    expect(clientMatchesFilter(baseClient, 'awaiting-quotes', [], [q])).toBe(false)
  })

  it('matches invoice on client.id and quote on clientProfileId for the same client', () => {
    expect(clientMatchesFilter(baseClient, 'unsent', [flatInvoice({ status: 'DRAFT' })], [flatQuote({ status: 'SENT' })])).toBe(true)
  })
})

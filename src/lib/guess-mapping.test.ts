import { describe, expect, it } from 'vitest'
import { guessMapping, scoreCandidates } from '@/lib/guess-mapping'

describe('guessMapping — amount columns', () => {
  it.each([
    [['Date', 'Description', 'Paid out', 'Paid in', 'Balance'], 'Paid out', 'Paid in'],
    [['Buchungstag', 'Verwendungszweck', 'Soll', 'Haben'], 'Soll', 'Haben'],
  ] as const)('detects split columns in %j', (headers, debitCol, creditCol) => {
    expect(guessMapping([...headers])).toMatchObject({ amountMode: 'split', debitCol, creditCol })
  })

  it('prefers a plain Amount column when debit and credit are also present', () => {
    expect(guessMapping(['Date', 'Description', 'Amount', 'Debit', 'Credit'])).toMatchObject({
      amountCol: 'Amount',
      amountSign: 'normal',
    })
    expect(guessMapping(['Date', 'Description', 'Amount', 'Debit', 'Credit']).amountMode).toBeUndefined()
  })

  it.each(['Debit/Credit', 'DebitCredit'])('recognizes %s as a single signed amount column', (amountCol) => {
    expect(guessMapping(['Date', 'Description', amountCol])).toMatchObject({ amountCol })
    expect(guessMapping(['Date', 'Description', amountCol]).amountMode).toBeUndefined()
  })

  it('does not treat a combined debit/credit header as either split side', () => {
    expect(scoreCandidates(['Debit/Credit'], 'debitCol')).toEqual([])
    expect(guessMapping(['Date', 'Description', 'Debit/Credit'])).toMatchObject({ amountCol: 'Debit/Credit' })
  })

  it('does not enable split mode when only one side is found', () => {
    expect(guessMapping(['Transaction Date', 'Debit', 'Memo'])).toMatchObject({ amountCol: 'Debit' })
    expect(guessMapping(['Transaction Date', 'Debit', 'Memo']).amountMode).toBeUndefined()
  })
})

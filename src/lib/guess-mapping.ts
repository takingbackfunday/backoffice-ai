import type { CsvMapping } from '@/lib/csv-processor'

export type MappedField = 'dateCol' | 'amountCol' | 'descCol' | 'notesCol' | 'debitCol' | 'creditCol'

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-().]/g, '')

const FIELD_PATTERNS: Record<MappedField, { exact: RegExp[]; strong: RegExp[]; moderate: RegExp[] }> = {
  dateCol: {
    exact:    [/^date$/],
    strong:   [/^txndate$/, /^transdate$/, /^transactiondate$/, /^posteddate$/, /^valuedate$/, /^settlementdate$/],
    moderate: [/date/],
  },
  amountCol: {
    exact:    [/^amount$/],
    strong:   [/^txnamount$/, /^transactionamount$/, /^debit\/?credit$/, /^credit$/, /^debit$/, /^amt$/],
    moderate: [/amount/, /amt/],
  },
  debitCol: {
    exact:    [/^debit$/, /^debits$/, /^paidout$/, /^moneyout$/, /^withdrawal$/, /^withdrawals$/, /^soll$/],
    strong:   [/^debitamount$/, /^amountout$/, /^outgoing$/, /^ausgang$/, /^belastung$/],
    moderate: [/debit/, /withdraw/, /paidout/],
  },
  creditCol: {
    exact:    [/^credit$/, /^credits$/, /^paidin$/, /^moneyin$/, /^deposit$/, /^deposits$/, /^haben$/],
    strong:   [/^creditamount$/, /^amountin$/, /^incoming$/, /^eingang$/, /^gutschrift$/],
    moderate: [/credit/, /deposit/, /paidin/],
  },
  descCol: {
    exact:    [/^description$/, /^narrative$/],
    strong:   [/^details$/, /^particulars$/, /^paymentdetails$/, /^transactiondetails$/, /^txndescription$/],
    moderate: [/desc/, /narr/, /detail/],
  },
  notesCol: {
    exact:    [/^notes$/, /^note$/, /^memo$/, /^remarks$/],
    strong:   [/^reference$/, /^comment/],
    moderate: [/note/, /memo/],
  },
}

export function scoreCandidates(headers: string[], field: MappedField): { col: string; score: number }[] {
  const { exact, strong, moderate } = FIELD_PATTERNS[field]
  const scored: { col: string; score: number }[] = []

  for (const h of headers) {
    const n = norm(h)
    if ((field === 'debitCol' || field === 'creditCol') && n.includes('debit') && n.includes('credit')) continue
    let score = 0
    if (exact.some((p) => p.test(n))) score = 1.0
    else if (strong.some((p) => p.test(n))) score = 0.9
    else if (moderate.some((p) => p.test(n))) score = 0.8
    if (score >= 0.8) scored.push({ col: h, score })
  }

  return scored.sort((a, b) => b.score - a.score)
}

export function guessMapping(headers: string[]): Partial<CsvMapping> {
  const find = (patterns: RegExp[]) =>
    headers.find((h) => patterns.some((p) => p.test(norm(h)))) ?? undefined

  const dateCol = find([
    /^date$/, /^txndate/, /^transdate/, /^transaction.*date/, /^posted.*date/,
    /^valuedate/, /^settlementdate/, /date/,
  ])
  const amountCol = find([
    /^amount$/, /^txnamount/, /^transactionamount/, /^debit\/?credit$/,
    /^credit$/, /^debit$/, /^amt$/, /amount/,
  ])
  const descCol = find([
    /^description$/, /^narrative$/, /^details$/, /^particulars$/,
    /^paymentdetails/, /^transactiondetails/, /^txndescription/,
    /desc/, /narr/, /detail/,
  ])
  const notesCol = find([
    /^notes$/, /^note$/, /^memo$/, /^remarks$/, /^comment/, /^reference$/,
    /notes/, /memo/,
  ])

  const debitCol = scoreCandidates(headers, 'debitCol')[0]?.col
  const creditCol = scoreCandidates(headers, 'creditCol')[0]?.col
  const hasPlainAmount = headers.some((h) => norm(h) === 'amount')
  if (debitCol && creditCol && debitCol !== creditCol && !hasPlainAmount) {
    return {
      ...(dateCol ? { dateCol } : {}),
      ...(descCol ? { descCol } : {}),
      ...(notesCol ? { notesCol } : {}),
      amountMode: 'split',
      debitCol,
      creditCol,
      amountSign: 'normal',
    }
  }

  // No dateFormat here — it's auto-detected from the column's values
  // (detectDateFormat in date-format.ts), not guessed from the header name.

  return {
    ...(dateCol ? { dateCol } : {}),
    ...(amountCol ? { amountCol } : {}),
    ...(descCol ? { descCol } : {}),
    ...(notesCol ? { notesCol } : {}),
    amountSign: 'normal',
  }
}

import type { CsvMapping } from '@/lib/csv-processor'

export type MappedField = 'dateCol' | 'amountCol' | 'descCol' | 'notesCol'

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-().]/g, '')

const FIELD_PATTERNS: Record<MappedField, { exact: RegExp[]; strong: RegExp[]; moderate: RegExp[] }> = {
  dateCol: {
    exact:    [/^date$/],
    strong:   [/^txndate$/, /^transdate$/, /^transactiondate$/, /^posteddate$/, /^valuedate$/, /^settlementdate$/],
    moderate: [/date/],
  },
  amountCol: {
    exact:    [/^amount$/],
    strong:   [/^txnamount$/, /^transactionamount$/, /^debitcredit$/, /^credit$/, /^debit$/, /^amt$/],
    moderate: [/amount/, /amt/],
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
    /^amount$/, /^txnamount/, /^transactionamount/, /^debitcredit$/,
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
  const dateFormat = (() => {
    const h = (dateCol ?? '').toLowerCase()
    if (h.includes('iso') || h.includes('yyyy')) return 'YYYY-MM-DD'
    return 'MM/DD/YYYY'
  })()

  return {
    ...(dateCol ? { dateCol } : {}),
    ...(amountCol ? { amountCol } : {}),
    ...(descCol ? { descCol } : {}),
    ...(notesCol ? { notesCol } : {}),
    dateFormat,
    amountSign: 'normal',
  }
}

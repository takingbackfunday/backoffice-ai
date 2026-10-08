import { buildDuplicateHash } from './dedup'
import { detectDateFormat, parseDateWithFormat, parseDateFallback, parseDateStructured, isKnownDateFormat } from './date-format'
import { analyzeCsv, repairRow, findStatementTotals, type RepairContext } from './csv-structure'
import { parseAmount } from './amount'

export { parseAmount } from './amount'

export interface CsvMapping {
  dateCol: string
  amountCol: string
  descCol: string
  /** Optional — when absent, the format is auto-detected from the column's values (see date-format.ts). */
  dateFormat?: string
  amountSign: 'normal' | 'inverted'
  notesCol?: string
}

export interface NormalizedRow {
  date: Date
  amount: number
  description: string
  notes?: string
  rawData: Record<string, string>
  duplicateHash: string
  /** 0-based index among identical rows (same account/date/amount/description) within this file. */
  occurrence: number
}

/** Cross-check of parsed sums against totals declared in a statement preamble. */
export interface Reconciliation {
  expectedCredits: number | null
  expectedDebits: number | null
  actualCredits: number
  actualDebits: number
  /** null when the statement declared no corresponding total. */
  creditsMatch: boolean | null
  debitsMatch: boolean | null
  matched: boolean
}

export interface ProcessResult {
  rows: NormalizedRow[]
  errors: string[]
  skippedCount: number
  totalParsed: number
  reconciliation?: Reconciliation
}

/** Cap on per-row error messages returned to the client (an overflow note is appended). */
const MAX_ERRORS = 20

/**
 * Resolve the format to parse with: the explicit mapping format when given,
 * otherwise auto-detected from the column's values. Returns null when neither
 * is available (every row will then fail with an "unrecognised date" error).
 */
function resolveDateFormat(colValues: (string | undefined)[], mapping: CsvMapping): string | null {
  if (mapping.dateFormat) return mapping.dateFormat
  const samples: string[] = []
  for (const v of colValues) {
    const t = v?.trim()
    if (t) samples.push(t)
    if (samples.length >= 200) break
  }
  return detectDateFormat(samples).format
}

/**
 * Per-row date parse.
 *
 *  - Explicit known format: strict — the row must match it.
 *  - Auto mode (no explicit format): the detected/detectable structured formats
 *    only. Never the native Date parser — V8 scrapes month-name substrings out
 *    of prose ("junk-0" → Jun 2000, "Row 0" → Jan 2000) and would silently
 *    invent dates. With a detected format, the structured fallback still
 *    rescues a stray row in another known format (e.g. one ISO datetime among
 *    DD.MM.YYYY rows); without one, the row fails loudly for the user to review.
 *  - Legacy unrecognised format id (e.g. an old profile's 'MM/dd/yyyy'): full
 *    leniency, including the native Date parser, as before.
 */
function parseRowDate(rawDate: string, format: string | null, autoMode: boolean): Date | null {
  let date: Date | null = null
  if (format) date = parseDateWithFormat(rawDate, format)
  if (date) return date
  if (autoMode) return parseDateStructured(rawDate)
  if (!format || !isKnownDateFormat(format)) return parseDateFallback(rawDate)
  return null // explicit known format: strict
}

export function processCSV(
  csvText: string,
  mapping: CsvMapping,
  accountId: string
): ProcessResult {
  const structure = analyzeCsv(csvText)
  const availableColumns = structure.headers

  // Validate that mapped columns actually exist in the CSV
  // Duplicate header names resolve to the first occurrence.
  const colIndex = (name: string | undefined) => (name ? availableColumns.indexOf(name) : -1)
  const dateIdx = colIndex(mapping.dateCol)
  const amountIdx = colIndex(mapping.amountCol)
  const descIdx = colIndex(mapping.descCol)
  const notesIdx = mapping.notesCol ? colIndex(mapping.notesCol) : -1

  const missingCols: string[] = []
  if (dateIdx === -1) missingCols.push(mapping.dateCol)
  if (amountIdx === -1) missingCols.push(mapping.amountCol)
  if (descIdx === -1) missingCols.push(mapping.descCol)
  if (missingCols.length > 0) {
    return {
      rows: [],
      errors: [`Column(s) not found in CSV: ${missingCols.map((c) => `"${c}"`).join(', ')}. Available columns: ${availableColumns.join(', ')}`],
      skippedCount: structure.rows.length,
      totalParsed: structure.rows.length,
    }
  }

  const headerCount = availableColumns.length
  const autoMode = !mapping.dateFormat
  const dateFormat = resolveDateFormat(structure.rows.map((r) => r[dateIdx]), mapping)

  const repairCtx: RepairContext = {
    headerCount,
    dateIdx,
    amountIdx,
    descIdx,
    notesIdx: notesIdx >= 0 ? notesIdx : undefined,
    delimiter: structure.delimiter,
    isDate: (v) => parseRowDate(v, dateFormat, autoMode) !== null,
  }

  const rows: NormalizedRow[] = []
  const allErrors: string[] = []
  let skippedCount = 0
  const totalParsed = structure.rows.length

  /** Validate one field array and build the normalized row, or return an error message. */
  const tryRow = (
    fields: string[],
    rowNum: number
  ): { ok: true; row: NormalizedRow } | { ok: false; error: string } => {
    const rawDate = fields[dateIdx]
    const rawAmount = fields[amountIdx]
    const description = fields[descIdx]?.trim() ?? ''

    if (!rawDate?.trim()) {
      return { ok: false, error: `Row ${rowNum}: date column "${mapping.dateCol}" is empty` }
    }
    if (!rawAmount?.trim()) {
      return { ok: false, error: `Row ${rowNum}: amount column "${mapping.amountCol}" is empty` }
    }

    const date = parseRowDate(rawDate, dateFormat, autoMode)
    if (!date) {
      return {
        ok: false,
        error: mapping.dateFormat
          ? `Row ${rowNum}: "${rawDate}" doesn't match format ${mapping.dateFormat} — is the date column correct?`
          : `Row ${rowNum}: "${rawDate}" is not a recognisable date — is the date column correct?`,
      }
    }

    const amount = parseAmount(rawAmount, mapping.amountSign === 'inverted')
    if (amount === null) {
      return { ok: false, error: `Row ${rowNum}: "${rawAmount}" is not a valid number — is the amount column correct?` }
    }

    const rawData: Record<string, string> = {}
    availableColumns.forEach((h, i) => {
      if (h && !(h in rawData)) rawData[h] = fields[i] ?? ''
    })

    return {
      ok: true,
      row: {
        date,
        amount,
        description,
        notes: notesIdx >= 0 ? fields[notesIdx]?.trim() || undefined : undefined,
        rawData,
        duplicateHash: buildDuplicateHash({ accountId, date, amount, description }),
        occurrence: 0,
      },
    }
  }

  // Genuine repeats (two identical fares on one day) must not collapse into one
  // transaction. The base hash (occurrence 0) is the grouping key.
  const occurrenceCounts = new Map<string, number>()

  for (let i = 0; i < structure.rows.length; i++) {
    const fields = structure.rows[i]
    const rowNum = (structure.headerIndex >= 0 ? structure.headerIndex + 2 : 1) + i // approximate 1-based position in parsed grid; blank lines are skipped

    // Pad short rows (exporter omitted trailing empty columns)
    const padded = fields.length < headerCount
      ? [...fields, ...Array(headerCount - fields.length).fill('')]
      : fields

    let result = tryRow(padded, rowNum)
    if (!result.ok) {
      // The row may be structurally shifted (unquoted delimiter in a memo,
      // split thousands separator…). Repair only when unambiguous.
      const repaired = repairRow(fields, repairCtx)
      if (repaired) result = tryRow(repaired, rowNum)
    }

    if (result.ok) {
      const baseHash = result.row.duplicateHash
      const occurrence = occurrenceCounts.get(baseHash) ?? 0
      occurrenceCounts.set(baseHash, occurrence + 1)
      if (occurrence > 0) {
        result.row.occurrence = occurrence
        result.row.duplicateHash = buildDuplicateHash({
          accountId,
          date: result.row.date,
          amount: result.row.amount,
          description: result.row.description,
          occurrence,
        })
      }
      rows.push(result.row)
    }
    else {
      skippedCount++
      allErrors.push(result.error)
    }
  }

  // Surface all failures up to a cap, with an explicit overflow note
  const errors = allErrors.slice(0, MAX_ERRORS)
  if (allErrors.length > MAX_ERRORS) {
    errors.push(`…and ${allErrors.length - MAX_ERRORS} more row(s) failed to parse.`)
  }

  // If we skipped everything or nearly everything, add a summary hint
  if (skippedCount > 0 && skippedCount === totalParsed && allErrors.length > 0) {
    errors.unshift(`All ${totalParsed} rows failed to parse. Check that your column selections match the CSV.`)
  } else if (skippedCount > totalParsed * 0.5 && allErrors.length > 0) {
    errors.unshift(`${skippedCount} of ${totalParsed} rows were skipped due to parse errors.`)
  }

  // Cross-check against the statement's own declared totals when present
  let reconciliation: Reconciliation | undefined
  const totals = findStatementTotals(structure.preamble)
  if (totals.credits != null || totals.debits != null) {
    const sign = mapping.amountSign === 'inverted' ? -1 : 1
    const actualCredits = rows.reduce((s, r) => (r.amount * sign > 0 ? s + r.amount * sign : s), 0)
    const actualDebits = rows.reduce((s, r) => (r.amount * sign < 0 ? s + r.amount * sign : s), 0)
    const creditsMatch =
      totals.credits == null ? null : Math.abs(Math.abs(actualCredits) - Math.abs(totals.credits)) < 0.01
    const debitsMatch =
      totals.debits == null ? null : Math.abs(Math.abs(actualDebits) - Math.abs(totals.debits)) < 0.01
    reconciliation = {
      expectedCredits: totals.credits ?? null,
      expectedDebits: totals.debits ?? null,
      actualCredits: Math.round(actualCredits * 100) / 100,
      actualDebits: Math.round(actualDebits * 100) / 100,
      creditsMatch,
      debitsMatch,
      matched: (creditsMatch ?? true) && (debitsMatch ?? true),
    }
  }

  return { rows, errors, skippedCount, totalParsed, ...(reconciliation ? { reconciliation } : {}) }
}

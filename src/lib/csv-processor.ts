import Papa from 'papaparse'
import { buildDuplicateHash } from './dedup'
import { detectDateFormat, parseDateWithFormat, parseDateFallback, isKnownDateFormat } from './date-format'

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
}

export interface ProcessResult {
  rows: NormalizedRow[]
  errors: string[]
  skippedCount: number
  totalParsed: number
}

/**
 * Resolve the format to parse with: the explicit mapping format when given,
 * otherwise auto-detected from the column's values. Returns null when neither
 * is available (every row will then fail with an "unrecognised date" error).
 */
function resolveDateFormat(data: Record<string, string>[], mapping: CsvMapping): string | null {
  if (mapping.dateFormat) return mapping.dateFormat
  const samples: string[] = []
  for (const row of data) {
    const v = row[mapping.dateCol]?.trim()
    if (v) samples.push(v)
    if (samples.length >= 200) break
  }
  return detectDateFormat(samples).format
}

function parseRowDate(rawDate: string, format: string | null, autoMode: boolean): Date | null {
  let date: Date | null = null
  if (format) date = parseDateWithFormat(rawDate, format)
  // Per-row fallback: in auto mode a stray value may differ from the file's main
  // format (e.g. one ISO datetime among DD.MM.YYYY rows). Legacy profiles with
  // unrecognised format ids (e.g. 'MM/dd/yyyy') also fall through here, matching
  // the old new Date() else-branch. An explicit known format stays strict.
  if (!date && (autoMode || !format || !isKnownDateFormat(format))) {
    date = parseDateFallback(rawDate)
  }
  return date
}

/**
 * Parse an amount string supporting both US (1,234.56) and European
 * (1.234,56 / 1234,56) number formats. When both separators are present the
 * rightmost one is the decimal separator and the other is thousands grouping.
 * A lone comma is a decimal comma unless it groups exactly 3 digits (1,234).
 * Handles (parenthesised), leading +/-, and trailing-minus negatives, and
 * strips $ € £, whitespace, and apostrophe grouping.
 */
export function parseAmount(raw: string, inverted: boolean): number | null {
  let clean = raw?.trim()
  if (!clean) return null

  let negative = false
  const parenMatch = clean.match(/^\((.+)\)$/)
  if (parenMatch) {
    negative = true
    clean = parenMatch[1].trim()
  }

  // Strip currency symbols, whitespace, and apostrophe thousands groups
  clean = clean.replace(/[$€£\s']/g, '')

  if (clean.startsWith('-') || clean.startsWith('+')) {
    if (clean.startsWith('-')) negative = true
    clean = clean.slice(1)
  }
  // Trailing minus (German "Soll" style): 12,50-
  if (clean.endsWith('-')) {
    negative = true
    clean = clean.slice(0, -1)
  }
  if (!clean) return null

  const lastComma = clean.lastIndexOf(',')
  const lastDot = clean.lastIndexOf('.')

  let normalized: string
  if (lastComma > -1 && lastDot > -1) {
    // Both present: the rightmost is the decimal separator
    normalized =
      lastComma > lastDot
        ? clean.replace(/\./g, '').replace(',', '.') // European: 1.234,56
        : clean.replace(/,/g, '') // US: 1,234.56
  } else if (lastComma > -1) {
    const commaCount = clean.split(',').length - 1
    const digitsAfterLast = clean.length - lastComma - 1
    normalized =
      commaCount === 1 && digitsAfterLast !== 3
        ? clean.replace(',', '.') // decimal comma: 12,50
        : clean.replace(/,/g, '') // thousands grouping: 1,234 / 1,234,567
  } else if ((clean.match(/\./g) ?? []).length > 1) {
    normalized = clean.replace(/\./g, '') // European thousands: 1.234.567
  } else {
    normalized = clean // single dot (US decimal) or plain integer
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const n = parseFloat(normalized)
  if (isNaN(n)) return null
  const signed = negative ? -n : n
  return inverted ? -signed : signed
}

export function processCSV(
  csvText: string,
  mapping: CsvMapping,
  accountId: string
): ProcessResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const availableColumns = result.meta.fields ?? []
  const rows: NormalizedRow[] = []
  const errors: string[] = []
  let skippedCount = 0
  const totalParsed = result.data.length

  // Validate that mapped columns actually exist in the CSV
  const missingCols: string[] = []
  for (const col of [mapping.dateCol, mapping.amountCol, mapping.descCol]) {
    if (!availableColumns.includes(col)) missingCols.push(col)
  }
  if (missingCols.length > 0) {
    return {
      rows: [],
      errors: [`Column(s) not found in CSV: ${missingCols.map((c) => `"${c}"`).join(', ')}. Available columns: ${availableColumns.join(', ')}`],
      skippedCount: totalParsed,
      totalParsed,
    }
  }

  const autoFormat = !mapping.dateFormat
  const dateFormat = resolveDateFormat(result.data, mapping)

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i]
    const rowNum = i + 2 // 1-based + header row

    const rawDate = row[mapping.dateCol]
    const rawAmount = row[mapping.amountCol]
    const description = row[mapping.descCol]?.trim() ?? ''

    if (!rawDate?.trim()) {
      if (errors.length < 5) errors.push(`Row ${rowNum}: date column "${mapping.dateCol}" is empty`)
      skippedCount++
      continue
    }

    if (!rawAmount?.trim()) {
      if (errors.length < 5) errors.push(`Row ${rowNum}: amount column "${mapping.amountCol}" is empty`)
      skippedCount++
      continue
    }

    const date = parseRowDate(rawDate, dateFormat, autoFormat)
    if (!date) {
      if (errors.length < 5) {
        errors.push(autoFormat
          ? `Row ${rowNum}: "${rawDate}" is not a recognisable date — is the date column correct?`
          : `Row ${rowNum}: "${rawDate}" doesn't match format ${mapping.dateFormat} — is the date column correct?`)
      }
      skippedCount++
      continue
    }

    const amount = parseAmount(rawAmount, mapping.amountSign === 'inverted')
    if (amount === null) {
      if (errors.length < 5) errors.push(`Row ${rowNum}: "${rawAmount}" is not a valid number — is the amount column correct?`)
      skippedCount++
      continue
    }

    const duplicateHash = buildDuplicateHash({ accountId, date, amount, description })

    rows.push({
      date,
      amount,
      description,
      notes: mapping.notesCol ? row[mapping.notesCol]?.trim() || undefined : undefined,
      rawData: row,
      duplicateHash,
    })
  }

  // If we skipped everything or nearly everything, add a summary hint
  if (skippedCount > 0 && skippedCount === totalParsed && errors.length > 0) {
    errors.unshift(`All ${totalParsed} rows failed to parse. Check that your column selections match the CSV.`)
  } else if (skippedCount > totalParsed * 0.5 && errors.length > 0) {
    errors.unshift(`${skippedCount} of ${totalParsed} rows were skipped due to parse errors.`)
  }

  return { rows, errors, skippedCount, totalParsed }
}

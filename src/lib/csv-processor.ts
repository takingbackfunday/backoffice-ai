import Papa from 'papaparse'
import { buildDuplicateHash } from './dedup'

export interface CsvMapping {
  dateCol: string
  amountCol: string
  descCol: string
  dateFormat: string   // e.g. "MM/DD/YYYY", "DD/MM/YYYY", "DD.MM.YYYY", "YYYY-MM-DD"
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

function parseDate(raw: string, format: string): Date | null {
  const clean = raw?.trim()
  if (!clean) return null
  try {
    let year: string, month: string, day: string

    if (format === 'MM/DD/YYYY') {
      const parts = clean.split('/')
      if (parts.length !== 3) return null
      ;[month, day, year] = parts
    } else if (format === 'DD/MM/YYYY') {
      const parts = clean.split('/')
      if (parts.length !== 3) return null
      ;[day, month, year] = parts
    } else if (format === 'DD.MM.YYYY') {
      const parts = clean.split('.')
      if (parts.length !== 3) return null
      ;[day, month, year] = parts
    } else if (format === 'YYYY-MM-DD') {
      const parts = clean.split('-')
      if (parts.length !== 3) return null
      ;[year, month, day] = parts
    } else {
      // Strip time component from datetime strings (e.g. "2025-01-01T00:00:00" from XLSX exports).
      // Parsing a bare datetime without a timezone offset uses local time, which shifts the date
      // for servers not in UTC. We only care about the date, so force UTC midnight.
      const datePart = clean.split('T')[0].split(' ')[0]
      const isoMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (isoMatch) {
        ;[, year, month, day] = isoMatch
      } else {
        const d = new Date(clean)
        return isNaN(d.getTime()) ? null : d
      }
    }

    if (!year || !month || !day) return null
    const m = month.padStart(2, '0')
    const d2 = day.padStart(2, '0')
    // Sanity check ranges before constructing
    const y = parseInt(year, 10)
    const mo = parseInt(m, 10)
    const dy = parseInt(d2, 10)
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || dy < 1 || dy > 31) return null

    const date = new Date(`${year}-${m}-${d2}`)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
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

    const date = parseDate(rawDate, mapping.dateFormat)
    if (!date) {
      if (errors.length < 5) errors.push(`Row ${rowNum}: "${rawDate}" doesn't match format ${mapping.dateFormat} — is the date column correct?`)
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

import Papa from 'papaparse'
import { buildDuplicateHash } from './dedup'

export interface CsvMapping {
  dateCol: string
  amountCol: string
  descCol: string
  dateFormat: string   // e.g. "MM/DD/YYYY", "YYYY-MM-DD", "DD/MM/YYYY"
  amountSign: 'normal' | 'inverted'
  merchantCol?: string
}

export interface NormalizedRow {
  date: Date
  amount: number
  description: string
  merchantName?: string
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
    } else if (format === 'YYYY-MM-DD') {
      const parts = clean.split('-')
      if (parts.length !== 3) return null
      ;[year, month, day] = parts
    } else {
      const d = new Date(clean)
      return isNaN(d.getTime()) ? null : d
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

function parseAmount(raw: string, inverted: boolean): number | null {
  const clean = raw?.trim().replace(/[,$\s]/g, '').replace(/\((.+)\)/, '-$1')
  if (!clean) return null
  const n = parseFloat(clean)
  if (isNaN(n)) return null
  return inverted ? -n : n
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
      merchantName: mapping.merchantCol ? row[mapping.merchantCol]?.trim() : undefined,
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

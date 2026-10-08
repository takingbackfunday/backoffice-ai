/**
 * Structural analysis for bank CSVs — delimiter sniffing, header-region
 * detection, and row repair. Pure module: no I/O, no Prisma, safe for client
 * and server use.
 *
 * Why this exists: real bank exports are messy in ways papaparse alone can't
 * absorb —
 *   1. Summary preambles: Chase/BofA statements prepend account-summary blocks
 *      above the real header row ("Description,,Summary Amt." … then the true
 *      "Date,Description,Amount" header several lines down). Treating line 1 as
 *      the header mis-keys every column and pollutes the data with junk rows.
 *   2. Unquoted delimiters in memo text: an unquoted comma inside a Zelle memo
 *      splits the description into extra fields, shifting Amount/Balance right.
 *   3. Unquoted thousands separators ("1,234.56" bare in a comma file) split a
 *      numeric column into fragments.
 *
 * `analyzeCsv` picks the header row by scoring candidates on how consistently
 * the data *beneath* them parses (language-agnostic), with column-name
 * vocabulary as a secondary signal. `repairRow` re-joins surplus fields into
 * text columns (or re-joins split numeric fragments) but only when exactly one
 * plausible repair exists — ambiguous rows are flagged, never silently guessed.
 */

import Papa from 'papaparse'
import { parseAmount, resolveSplitAmount } from './amount'
import { parseDateStructured } from './date-format'

export interface CsvStructure {
  delimiter: string
  /** Index of the header row in the parsed grid, or -1 when the file looks headerless. */
  headerIndex: number
  /** Header cell values (trimmed). Synthesised as "Column N" when headerless. */
  headers: string[]
  /** Data rows after the header, as field arrays. */
  rows: string[][]
  /** Rows before the header (account-summary preamble). Empty for clean files. */
  preamble: string[][]
  /** True when no header row was found and headers were synthesised. */
  headerless: boolean
}

// ─── Delimiter sniffing ─────────────────────────────────────────────────────

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|']

/** Count delimiter occurrences outside quoted regions of a single line. */
function countOutsideQuotes(line: string, delim: string): number {
  let inQuotes = false
  let n = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') i++ // escaped quote
      else inQuotes = !inQuotes
    } else if (c === delim && !inQuotes) {
      n++
    }
  }
  return n
}

/**
 * Pick the delimiter by consistency across the first ~20 non-empty lines.
 * Sniffing raw lines (rather than relying on papaparse's guess, which keys off
 * the first row) keeps a prose preamble line from fooling the detection.
 */
export function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 20)
  if (lines.length === 0) return ','

  let best = ','
  let bestConsistent = 0
  let bestModal = 0
  for (const d of CANDIDATE_DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d)).filter((c) => c > 0)
    if (counts.length === 0) continue

    const frequencies = new Map<number, number>()
    for (const count of counts) frequencies.set(count, (frequencies.get(count) ?? 0) + 1)
    let modal = 0
    let consistent = 0
    for (const [count, frequency] of frequencies) {
      if (frequency > consistent || (frequency === consistent && count > modal)) {
        modal = count
        consistent = frequency
      }
    }
    if (consistent > bestConsistent || (consistent === bestConsistent && modal > bestModal)) {
      best = d
      bestConsistent = consistent
      bestModal = modal
    }
  }
  return bestConsistent > 0 ? best : ','
}

// ─── Header-region detection ────────────────────────────────────────────────

/** Whole-word tokens matched against header cells after splitting on non-alphanumerics. */
const WORD_TOKENS = new Set([
  'date', 'datum', 'valuta', 'posted', 'posting',
  'description', 'desc', 'details', 'particulars', 'narrative', 'payee', 'memo',
  'note', 'notes', 'reference', 'ref',
  'amount', 'amt', 'betrag', 'sum', 'debit', 'credit', 'soll', 'haben',
  'withdrawal', 'withdrawals', 'deposit', 'deposits',
  'balance', 'bal', 'saldo', 'running',
  'type', 'category', 'currency',
])
/** Unambiguous longer tokens matched as substrings of the normalised cell. */
const CONTAINS_TOKENS = [
  'verwendungszweck', 'buchungstag', 'buchungsdatum', 'buchungstext',
  'transactiondate', 'postingdate', 'valuedate', 'settlementdate',
  'empfaenger', 'waehrung', 'beguenstigter',
]

function normalizeHeaderCell(cell: string): string {
  return cell
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics: währung → wahrung
    .toLowerCase()
}

function isVocabHeader(cell: string): boolean {
  const norm = normalizeHeaderCell(cell)
  if (!norm) return false
  const words = norm.split(/[^a-z0-9]+/).filter(Boolean)
  if (words.some((w) => WORD_TOKENS.has(w))) return true
  const joined = words.join('')
  return CONTAINS_TOKENS.some((t) => joined.includes(t))
}

const MAX_HEADER_SCAN = 15
const SAMPLE_ROWS = 50

/** Score a grid row as a potential header by how well the data beneath it parses. */
function scoreHeaderCandidate(grid: string[][], h: number): number {
  const headerCells = grid[h]
  const data = grid.slice(h + 1, h + 1 + SAMPLE_ROWS)
  if (data.length === 0) return 0
  const width = headerCells.length

  // Column-count stability of the rows below
  const stability = data.filter((r) => r.length === width).length / data.length

  // Content typing: best date-like column ratio + best numeric column ratio
  let dateRatio = 0
  let numRatio = 0
  for (let c = 0; c < width; c++) {
    const vals = data.map((r) => r[c]).filter((v) => v && v.trim())
    if (vals.length === 0) continue
    const dr = vals.filter((v) => parseDateStructured(v) !== null).length / vals.length
    const nr = vals.filter((v) => parseAmount(v, false) !== null).length / vals.length
    if (dr > dateRatio) dateRatio = dr
    if (nr > numRatio) numRatio = nr
  }

  // Column-name vocabulary (secondary signal — headers should look like labels)
  const vocabHits = headerCells.filter(isVocabHeader).length

  // A row whose cells themselves look like data (a date + a number, no vocab)
  // is not a header — it's the first data row of a headerless file.
  const looksLikeData =
    vocabHits === 0 &&
    headerCells.some((c) => parseDateStructured(c) !== null) &&
    headerCells.some((c) => parseAmount(c, false) !== null)

  return (
    2 * dateRatio +
    2 * numRatio +
    0.5 * Math.min(vocabHits, 4) +
    stability -
    (looksLikeData ? 1.5 : 0)
  )
}

/**
 * Analyse raw CSV text into its structural parts: delimiter, header row,
 * data rows, and any preamble rows above the header.
 */
export function analyzeCsv(text: string): CsvStructure {
  const delimiter = sniffDelimiter(text)
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    delimiter,
    skipEmptyLines: 'greedy',
  })
  const grid = parsed.data.filter((r) => r.length > 0)
  if (grid.length === 0) {
    return { delimiter, headerIndex: -1, headers: [], rows: [], preamble: [], headerless: false }
  }
  if (grid.length === 1) {
    return {
      delimiter,
      headerIndex: 0,
      headers: grid[0].map((h) => h.trim()),
      rows: [],
      preamble: [],
      headerless: false,
    }
  }

  const scanLimit = Math.min(MAX_HEADER_SCAN, grid.length - 1)
  let bestIdx = 0
  let bestScore = -Infinity
  for (let h = 0; h <= scanLimit; h++) {
    const score = scoreHeaderCandidate(grid, h)
    if (score > bestScore) {
      bestScore = score
      bestIdx = h
    }
  }

  const winner = grid[bestIdx]
  const vocabHits = winner.filter(isVocabHeader).length
  const looksLikeData =
    vocabHits === 0 &&
    winner.some((c) => parseDateStructured(c) !== null) &&
    winner.some((c) => parseAmount(c, false) !== null)

  if (looksLikeData) {
    // Headerless file: synthesise stable column names from the modal row width
    const widths = new Map<number, number>()
    for (const r of grid.slice(0, 20)) widths.set(r.length, (widths.get(r.length) ?? 0) + 1)
    const width = [...widths.entries()].sort((a, b) => b[1] - a[1])[0][0]
    return {
      delimiter,
      headerIndex: -1,
      headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`),
      rows: grid,
      preamble: [],
      headerless: true,
    }
  }

  return {
    delimiter,
    headerIndex: bestIdx,
    headers: winner.map((h) => h.trim()),
    rows: grid.slice(bestIdx + 1),
    preamble: grid.slice(0, bestIdx),
    headerless: false,
  }
}

// ─── Row repair ─────────────────────────────────────────────────────────────

export interface RepairContext {
  headerCount: number
  dateIdx: number
  amountIdx: number
  /** Split mode only: index of the credit column. `amountIdx` then holds the debit column. */
  creditIdx?: number
  descIdx: number
  notesIdx?: number
  delimiter: string
  /** Date validator honouring the file's resolved format. */
  isDate: (v: string) => boolean
}

const MAX_MERGE_WIDTH = 4

/**
 * Attempt to repair a row whose fields don't align with the header — typically
 * because an unquoted delimiter inside a text field (memo/description) split it
 * into pieces, or a thousands separator split a number.
 *
 * Strategy: merge a window of adjacent fields (width 2..MAX_MERGE_WIDTH) at
 * every position; keep candidates where all typed columns then validate.
 * A merge into a text column whose fragments look numeric is implausible (it's
 * more likely a split number) and is only used when nothing plausible exists.
 *
 * Returns the single unambiguous repair, or null when there is none — an
 * ambiguous row is flagged to the user rather than silently guessed.
 *
 * Note: rows with an *empty* typed column are not repairable — absence of a
 * value is legitimate information (e.g. a beginning-balance marker row), not a
 * structural defect.
 */
export function repairRow(fields: string[], ctx: RepairContext): string[] | null {
  const { headerCount: H, dateIdx, amountIdx, descIdx, notesIdx, delimiter, isDate } = ctx
  const split = ctx.creditIdx != null && ctx.creditIdx >= 0
  if (fields.length === 0) return null

  // Short row: exporter omitted trailing columns — padding is the canonical
  // fix, as long as the typed columns physically exist.
  if (fields.length < H) {
    if (dateIdx < fields.length && amountIdx < fields.length && descIdx < fields.length && (!split || ctx.creditIdx! < fields.length)) {
      return [...fields, ...Array(H - fields.length).fill('')]
    }
    return null
  }

  // From here fields.length >= H. A genuinely empty typed column is not a
  // structural defect (e.g. a beginning-balance marker row) — don't repair.
  const typedIdx = [dateIdx, ...(split ? [] : [amountIdx]), descIdx, notesIdx].filter((i): i is number => i != null && i >= 0)
  if (typedIdx.some((i) => !fields[i]?.trim())) return null
  if (split && !fields[amountIdx]?.trim() && !fields[ctx.creditIdx!]?.trim()) return null

  interface Candidate {
    row: string[]
    mergeCol: number
    plausible: boolean
  }
  const candidates: Candidate[] = []

  const validate = (row: string[]): boolean => {
    if (dateIdx >= row.length || amountIdx >= row.length || descIdx >= row.length || (split && ctx.creditIdx! >= row.length)) return false
    if (!isDate(row[dateIdx])) return false
    if (split ? !resolveSplitAmount(row[amountIdx], row[ctx.creditIdx!]).ok : parseAmount(row[amountIdx], false) === null) return false
    if (!row[descIdx]?.trim()) return false
    return true
  }

  for (let w = 2; w <= MAX_MERGE_WIDTH; w++) {
    for (let p = 0; p + w <= fields.length; p++) {
      const fragments = fields.slice(p, p + w)
      const merged = fragments.join(delimiter)
      const row = [...fields.slice(0, p), merged, ...fields.slice(p + w)]
      if (row.length > H) continue
      while (row.length < H) row.push('')
      if (!validate(row)) continue

      const isTextMerge = p === descIdx || p === notesIdx
      const hasNumericFragment = fragments.some((f) => parseAmount(f, false) !== null)
      // Text merges with numeric-looking fragments are implausible (likely a
      // split number instead); numeric merges are validated by parseability.
      const plausible = isTextMerge ? !hasNumericFragment : true
      candidates.push({ row, mergeCol: p, plausible })
    }
  }

  if (candidates.length === 0) return null
  const plausible = candidates.filter((c) => c.plausible)
  const pool = plausible.length > 0 ? plausible : candidates
  if (pool.length === 1) return pool[0].row

  // Prefer a merge in the description column among the remaining candidates
  const descPool = pool.filter((c) => c.mergeCol === descIdx)
  if (descPool.length === 1) return descPool[0].row

  return null // ambiguous — flag rather than guess
}

// ─── Statement-summary reconciliation ───────────────────────────────────────

export interface StatementTotals {
  credits?: number
  debits?: number
}

/**
 * Extract declared totals ("Total credits … 108,951.19") from preamble rows of
 * a bank-statement export. Used to cross-check parsed sums against the
 * statement's own summary — turns silent corruption into a visible signal.
 */
export function findStatementTotals(preamble: string[][]): StatementTotals {
  const totals: StatementTotals = {}
  for (const row of preamble) {
    const label = normalizeHeaderCell(row.join(' '))
    const amount = row.map((c) => parseAmount(c, false)).find((v) => v !== null) ?? undefined
    if (amount == null) continue
    if (totals.credits == null && /totals?\s+(credits?|deposits?)\b/.test(label)) totals.credits = amount
    if (totals.debits == null && /totals?\s+(debits?|withdrawals?)\b/.test(label)) totals.debits = amount
  }
  return totals
}

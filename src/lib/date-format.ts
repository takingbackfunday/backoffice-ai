/**
 * Automatic bank-statement date format detection and parsing.
 *
 * Replaces the manual "date format" picker in the CSV import flow: given the
 * raw values from the mapped date column, `detectDateFormat` finds the single
 * format that parses every row. When two formats both fit but disagree on the
 * meaning (the classic MM/DD vs DD/MM ambiguity where every day ≤ 12), the
 * detection is flagged `ambiguous` so the UI can ask the user to confirm.
 *
 * Supported families:
 *  - ISO:                2024-01-15, 2024/01/15, 2024.01.15 (+ datetime suffixes)
 *  - US / EU numeric:    MM/DD/YYYY, DD/MM/YYYY with / . - separators, 2- or 4-digit years
 *  - Compact:            20240115
 *  - Month names (EN/DE): 15 Jan 2024, Jan 15, 2024, 15-Jan-2024, 15. Mär 2024
 */

export interface DateFormatDetection {
  /** Canonical format id chosen (e.g. 'DD/MM/YYYY'), or null when nothing was recognised. */
  format: string | null
  /** True when several formats fit every sample but produce different dates — ask the user. */
  ambiguous: boolean
  /** Other format ids that also fit every sample (populated when ambiguous). */
  alternatives: string[]
  /** Share of samples the chosen format parses (1 when one format fits all rows). */
  matchedRatio: number
  /** First raw sample — useful for rendering an example in the UI. */
  exampleRaw?: string
}

interface Parts {
  y: number
  m: number
  d: number
}

interface FormatParser {
  id: string
  parse: (raw: string) => Parts | null
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mär: 3, apr: 4, may: 5, mai: 5,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
}

/** POSIX strptime sliding window: 00–68 → 2000s, 69–99 → 1900s. */
function pivotYear(yy: number): number {
  return yy <= 68 ? 2000 + yy : 1900 + yy
}

function validParts(y: number, m: number, d: number): Parts | null {
  if (y < 1900 || y > 2100) return null
  if (m < 1 || m > 12) return null
  if (d < 1 || d > 31) return null
  return { y, m, d }
}

function makeNumeric(id: string, order: 'MDY' | 'DMY', sep: '/' | '.' | '-', twoDigitYear: boolean): FormatParser {
  const esc = sep === '.' ? '\\.' : sep
  const year = twoDigitYear ? '(\\d{2})' : '(\\d{4})'
  const regex = new RegExp(`^(\\d{1,2})${esc}(\\d{1,2})${esc}${year}$`)
  return {
    id,
    parse(raw) {
      const match = raw.match(regex)
      if (!match) return null
      const first = parseInt(match[1], 10)
      const second = parseInt(match[2], 10)
      let y = parseInt(match[3], 10)
      if (twoDigitYear) y = pivotYear(y)
      return order === 'MDY' ? validParts(y, first, second) : validParts(y, second, first)
    },
  }
}

const isoParser: FormatParser = {
  id: 'YYYY-MM-DD',
  parse(raw) {
    const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
    if (!match) return null
    return validParts(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10))
  },
}

const compactParser: FormatParser = {
  id: 'YYYYMMDD',
  parse(raw) {
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (!match) return null
    return validParts(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10))
  },
}

/** "15 Jan 2024" / "15-Jan-2024" / "15. Mär 2024" / "January 15th 2024" → comparable token stream. */
function normalizeWords(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/(\d{1,2})(st|nd|rd|th)\b/g, '$1')
    .replace(/[.,/]+/g, ' ')
    .replace(/-+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function monthFromToken(token: string): number | null {
  return MONTHS[token.slice(0, 3)] ?? null
}

const dayFirstMonthName: FormatParser = {
  id: 'DD MMM YYYY',
  parse(raw) {
    const match = normalizeWords(raw).match(/^(\d{1,2}) ([a-zäöü]+) (\d{2,4})$/)
    if (!match) return null
    const mo = monthFromToken(match[2])
    if (!mo) return null
    let y = parseInt(match[3], 10)
    if (match[3].length === 2) y = pivotYear(y)
    return validParts(y, mo, parseInt(match[1], 10))
  },
}

const monthFirstMonthName: FormatParser = {
  id: 'MMM DD YYYY',
  parse(raw) {
    const match = normalizeWords(raw).match(/^([a-zäöü]+) (\d{1,2}) (\d{2,4})$/)
    if (!match) return null
    const mo = monthFromToken(match[1])
    if (!mo) return null
    let y = parseInt(match[3], 10)
    if (match[3].length === 2) y = pivotYear(y)
    return validParts(y, mo, parseInt(match[2], 10))
  },
}

/**
 * Registry order doubles as the priority order for ambiguous picks and per-row
 * fallback: ISO first (never ambiguous), then the continental-European dot and
 * dash conventions, US slash, remaining mixes, and month-name formats last.
 */
const PARSERS: FormatParser[] = [
  isoParser,
  compactParser,
  makeNumeric('DD.MM.YYYY', 'DMY', '.', false),
  makeNumeric('DD.MM.YY', 'DMY', '.', true),
  makeNumeric('DD-MM-YYYY', 'DMY', '-', false),
  makeNumeric('DD-MM-YY', 'DMY', '-', true),
  makeNumeric('MM/DD/YYYY', 'MDY', '/', false),
  makeNumeric('MM/DD/YY', 'MDY', '/', true),
  makeNumeric('DD/MM/YYYY', 'DMY', '/', false),
  makeNumeric('DD/MM/YY', 'DMY', '/', true),
  makeNumeric('MM-DD-YYYY', 'MDY', '-', false),
  makeNumeric('MM-DD-YY', 'MDY', '-', true),
  makeNumeric('MM.DD.YYYY', 'MDY', '.', false),
  makeNumeric('MM.DD.YY', 'MDY', '.', true),
  dayFirstMonthName,
  monthFirstMonthName,
]

const KNOWN_FORMAT_IDS = new Set(PARSERS.map((p) => p.id))

export function isKnownDateFormat(id: string): boolean {
  return KNOWN_FORMAT_IDS.has(id)
}

/** Strip a trailing time component ("…T10:30:00Z", "… 10:30 AM") so date parsers see only the date. */
function stripTime(raw: string): string {
  return raw
    .replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(a\.?m\.?|p\.?m\.?)?\s*(Z|[+-]\d{2}:?\d{2})?\s*$/i, '')
    .trim()
}

/** UTC-midnight Date, rejecting impossible calendar dates (Feb 31 rolls over → null). */
function constructDate({ y, m, d }: Parts): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

const partsKey = (p: Parts) => `${p.y}-${p.m}-${p.d}`

/**
 * Detect the date format of a column from its raw values. Strict: a format only
 * "survives" if it parses every non-empty sample. If several survive and they
 * disagree on at least one sample's meaning, the result is `ambiguous` and the
 * UI should confirm — the chosen default follows regional priors (`.`/`-` →
 * day-first, `/` → month-first, preserving the historical US default).
 */
export function detectDateFormat(samples: string[]): DateFormatDetection {
  const cleaned = samples
    .map((s) => stripTime((s ?? '').trim()))
    .filter(Boolean)
    .slice(0, 200)

  if (cleaned.length === 0) {
    return { format: null, ambiguous: false, alternatives: [], matchedRatio: 0 }
  }

  const survivors = PARSERS.filter((p) => cleaned.every((s) => p.parse(s) !== null))

  if (survivors.length > 0) {
    const chosen = survivors[0]
    const ambiguous = cleaned.some((s) => {
      const ref = partsKey(chosen.parse(s)!)
      return survivors.slice(1).some((p) => partsKey(p.parse(s)!) !== ref)
    })
    return {
      format: chosen.id,
      ambiguous,
      alternatives: ambiguous ? survivors.slice(1).map((p) => p.id) : [],
      matchedRatio: 1,
      exampleRaw: cleaned[0],
    }
  }

  // No format fits everything — allow a best-effort match for dirty files
  // (e.g. one junk row) as long as it covers the vast majority of samples.
  let best: FormatParser | null = null
  let bestCount = 0
  for (const p of PARSERS) {
    const n = cleaned.filter((s) => p.parse(s) !== null).length
    if (n > bestCount) {
      best = p
      bestCount = n
    }
  }
  const matchedRatio = bestCount / cleaned.length
  if (best && matchedRatio >= 0.8) {
    return { format: best.id, ambiguous: false, alternatives: [], matchedRatio, exampleRaw: cleaned[0] }
  }
  return { format: null, ambiguous: false, alternatives: [], matchedRatio, exampleRaw: cleaned[0] }
}

/** Parse one raw value with a specific canonical format id. Unknown ids return null. */
export function parseDateWithFormat(raw: string, formatId: string): Date | null {
  const parser = PARSERS.find((p) => p.id === formatId)
  if (!parser) return null
  const clean = stripTime((raw ?? '').trim())
  if (!clean) return null
  const parts = parser.parse(clean)
  return parts ? constructDate(parts) : null
}

/**
 * Last-resort parse: try every known format in priority order, then fall back
 * to the native Date parser for oddball inputs. Only used per-row when the
 * primary format fails (auto mode) or for legacy unrecognised format ids.
 */
export function parseDateFallback(raw: string): Date | null {
  const clean = stripTime((raw ?? '').trim())
  if (!clean) return null
  for (const parser of PARSERS) {
    const parts = parser.parse(clean)
    if (parts) {
      const date = constructDate(parts)
      if (date) return date
    }
  }
  const d = new Date(clean)
  return isNaN(d.getTime()) ? null : d
}

/** Render how a raw value would be read under a format — for the ambiguity confirmation UI. */
export function renderDateExample(raw: string, formatId: string): string {
  const date = parseDateWithFormat(raw, formatId)
  if (!date) return formatId
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

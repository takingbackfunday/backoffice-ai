import { describe, it, expect } from 'vitest'
import {
  detectDateFormat,
  parseDateWithFormat,
  parseDateFallback,
  renderDateExample,
  isKnownDateFormat,
} from '@/lib/date-format'

const iso = (d: Date | null) => d?.toISOString().slice(0, 10)

describe('detectDateFormat — unambiguous formats', () => {
  it('detects ISO dates', () => {
    const det = detectDateFormat(['2024-01-15', '2024-12-31', '2025-02-20'])
    expect(det.format).toBe('YYYY-MM-DD')
    expect(det.ambiguous).toBe(false)
    expect(det.matchedRatio).toBe(1)
  })

  it('detects ISO datetimes by stripping the time component', () => {
    const det = detectDateFormat(['2024-01-15T10:30:00Z', '2024-02-20 08:15:00'])
    expect(det.format).toBe('YYYY-MM-DD')
    expect(det.ambiguous).toBe(false)
  })

  it('detects DD.MM.YYYY when a day > 12 proves day-first', () => {
    const det = detectDateFormat(['23.07.2026', '01.01.2026', '5.3.2026'])
    expect(det.format).toBe('DD.MM.YYYY')
    expect(det.ambiguous).toBe(false)
  })

  it('detects MM/DD/YYYY when a day > 12 proves month-first', () => {
    const det = detectDateFormat(['12/31/2024', '01/15/2025'])
    expect(det.format).toBe('MM/DD/YYYY')
    expect(det.ambiguous).toBe(false)
  })

  it('detects DD/MM/YYYY when a day > 12 proves day-first', () => {
    const det = detectDateFormat(['31/12/2024', '15/01/2025'])
    expect(det.format).toBe('DD/MM/YYYY')
    expect(det.ambiguous).toBe(false)
  })

  it('detects compact YYYYMMDD', () => {
    const det = detectDateFormat(['20240115', '20240220'])
    expect(det.format).toBe('YYYYMMDD')
    expect(det.ambiguous).toBe(false)
  })

  it('detects day-first month names (English)', () => {
    const det = detectDateFormat(['15 Jan 2024', '3 February 2024', '15-Mar-2024'])
    expect(det.format).toBe('DD MMM YYYY')
    expect(det.ambiguous).toBe(false)
  })

  it('detects month-first month names (English)', () => {
    const det = detectDateFormat(['Jan 15, 2024', 'February 3, 2024'])
    expect(det.format).toBe('MMM DD YYYY')
    expect(det.ambiguous).toBe(false)
  })

  it('detects German month names', () => {
    const det = detectDateFormat(['15. Mär 2024', '01. Dez. 2024', '5. Mai 2024'])
    expect(det.format).toBe('DD MMM YYYY')
    expect(det.ambiguous).toBe(false)
  })
})

describe('detectDateFormat — ambiguity handling', () => {
  it('flags MM/DD vs DD/MM when every day ≤ 12 and picks the US prior', () => {
    const det = detectDateFormat(['05/06/2024', '01/02/2024', '10/11/2024'])
    expect(det.format).toBe('MM/DD/YYYY')
    expect(det.ambiguous).toBe(true)
    expect(det.alternatives).toEqual(['DD/MM/YYYY'])
  })

  it('flags DD.MM vs MM.DD and picks the European prior', () => {
    const det = detectDateFormat(['05.06.2024', '01.02.2024'])
    expect(det.format).toBe('DD.MM.YYYY')
    expect(det.ambiguous).toBe(true)
    expect(det.alternatives).toEqual(['MM.DD.YYYY'])
  })

  it('is not ambiguous when day == month in every sample (both readings agree)', () => {
    const det = detectDateFormat(['01/01/2024', '02/02/2024'])
    expect(det.format).toBe('MM/DD/YYYY')
    expect(det.ambiguous).toBe(false)
    expect(det.alternatives).toEqual([])
  })

  it('resolves ambiguity as soon as one row has a day > 12', () => {
    const det = detectDateFormat(['05/06/2024', '01/02/2024', '05/13/2024'])
    expect(det.format).toBe('MM/DD/YYYY')
    expect(det.ambiguous).toBe(false)
  })

  it('flags 2-digit-year slash dates as ambiguous too', () => {
    const det = detectDateFormat(['05/06/24', '01/02/24'])
    expect(det.format).toBe('MM/DD/YY')
    expect(det.ambiguous).toBe(true)
    expect(det.alternatives).toEqual(['DD/MM/YY'])
  })
})

describe('detectDateFormat — dirty and unrecognisable data', () => {
  it('returns null for empty samples', () => {
    expect(detectDateFormat([]).format).toBeNull()
    expect(detectDateFormat(['', '  ']).format).toBeNull()
  })

  it('returns null for non-date junk', () => {
    const det = detectDateFormat(['foo', 'bar', 'baz'])
    expect(det.format).toBeNull()
    expect(det.matchedRatio).toBe(0)
  })

  it('picks a best-effort format when junk rows are a small minority', () => {
    const samples = ['23.07.2026', '01.01.2026', '05.03.2026', 'N/A', '12.12.2025', '31.01.2026', '02.02.2026', '09.09.2025', '10.10.2025', '11.11.2025']
    const det = detectDateFormat(samples)
    expect(det.format).toBe('DD.MM.YYYY')
    expect(det.matchedRatio).toBe(0.9)
  })

  it('returns null when no format covers at least 80% of samples', () => {
    const det = detectDateFormat(['23.07.2026', 'junk1', 'junk2', 'junk3'])
    expect(det.format).toBeNull()
    expect(det.matchedRatio).toBe(0.25)
  })
})

describe('parseDateWithFormat', () => {
  it('parses the four legacy format ids exactly as before', () => {
    expect(iso(parseDateWithFormat('31/12/2024', 'DD/MM/YYYY'))).toBe('2024-12-31')
    expect(iso(parseDateWithFormat('12/31/2024', 'MM/DD/YYYY'))).toBe('2024-12-31')
    expect(iso(parseDateWithFormat('5.3.2026', 'DD.MM.YYYY'))).toBe('2026-03-05')
    expect(iso(parseDateWithFormat('2026-07-23', 'YYYY-MM-DD'))).toBe('2026-07-23')
  })

  it('rejects out-of-range components', () => {
    expect(parseDateWithFormat('45.07.2026', 'DD.MM.YYYY')).toBeNull()
    expect(parseDateWithFormat('10.13.2026', 'DD.MM.YYYY')).toBeNull()
    expect(parseDateWithFormat('00/05/2024', 'MM/DD/YYYY')).toBeNull()
  })

  it('rejects impossible calendar dates instead of rolling over', () => {
    expect(parseDateWithFormat('31/02/2024', 'DD/MM/YYYY')).toBeNull()
    expect(parseDateWithFormat('02/31/2024', 'MM/DD/YYYY')).toBeNull()
  })

  it('strips time components before parsing', () => {
    expect(iso(parseDateWithFormat('2024-01-15T13:45:00', 'YYYY-MM-DD'))).toBe('2024-01-15')
    expect(iso(parseDateWithFormat('15/01/2024 13:45', 'DD/MM/YYYY'))).toBe('2024-01-15')
  })

  it('applies the 2-digit-year sliding window', () => {
    expect(iso(parseDateWithFormat('31/12/99', 'DD/MM/YY'))).toBe('1999-12-31')
    expect(iso(parseDateWithFormat('01/01/68', 'DD/MM/YY'))).toBe('2068-01-01')
    expect(iso(parseDateWithFormat('05/06/24', 'MM/DD/YY'))).toBe('2024-05-06')
  })

  it('returns null for unknown format ids', () => {
    expect(parseDateWithFormat('31/12/2024', 'MM/dd/yyyy')).toBeNull()
  })

  it('parses month-name formats', () => {
    expect(iso(parseDateWithFormat('15 Jan 2024', 'DD MMM YYYY'))).toBe('2024-01-15')
    expect(iso(parseDateWithFormat('Jan 15, 2024', 'MMM DD YYYY'))).toBe('2024-01-15')
    expect(iso(parseDateWithFormat('January 15th, 2024', 'MMM DD YYYY'))).toBe('2024-01-15')
    expect(iso(parseDateWithFormat('15. Mär 2024', 'DD MMM YYYY'))).toBe('2024-03-15')
  })
})

describe('parseDateFallback', () => {
  it('parses any known format in priority order', () => {
    expect(iso(parseDateFallback('23.07.2026'))).toBe('2026-07-23')
    expect(iso(parseDateFallback('2024-01-15'))).toBe('2024-01-15')
    expect(iso(parseDateFallback('31/12/2024'))).toBe('2024-12-31')
    expect(iso(parseDateFallback('15 Jan 2024'))).toBe('2024-01-15')
  })

  it('handles datetimes and junk', () => {
    expect(iso(parseDateFallback('2024-01-15T10:30:00Z'))).toBe('2024-01-15')
    expect(parseDateFallback('garbage')).toBeNull()
    expect(parseDateFallback('')).toBeNull()
  })
})

describe('renderDateExample + isKnownDateFormat', () => {
  it('renders how a raw value reads under a format', () => {
    expect(renderDateExample('05/06/2024', 'MM/DD/YYYY')).toBe('May 6, 2024')
    expect(renderDateExample('05/06/2024', 'DD/MM/YYYY')).toBe('Jun 5, 2024')
  })

  it('falls back to the format id when the example does not parse', () => {
    expect(renderDateExample('junk', 'MM/DD/YYYY')).toBe('MM/DD/YYYY')
  })

  it('knows the canonical format ids', () => {
    expect(isKnownDateFormat('DD/MM/YYYY')).toBe(true)
    expect(isKnownDateFormat('MM/dd/yyyy')).toBe(false)
  })
})

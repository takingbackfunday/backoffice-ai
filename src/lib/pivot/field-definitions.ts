import { parse } from 'date-fns'
import type { FieldDef } from './types'

export const FIELD_DEFINITIONS: FieldDef[] = [
  // Time
  { key: 'month', label: 'Month', group: 'Time' },
  { key: 'quarter', label: 'Quarter', group: 'Time' },
  { key: 'year', label: 'Year', group: 'Time' },
  { key: 'dayOfWeek', label: 'Day of Week', group: 'Time' },
  // Categories & Tax
  { key: 'category', label: 'Category', group: 'Categories & Tax' },
  { key: 'categoryGroup', label: 'Category Group', group: 'Categories & Tax' },
  { key: 'taxType', label: 'Tax Type', group: 'Categories & Tax' },
  // Parties
  { key: 'payee', label: 'Payee', group: 'Parties' },
  { key: 'account', label: 'Account', group: 'Parties' },
  { key: 'accountType', label: 'Account Type', group: 'Parties' },
  // Projects
  { key: 'project', label: 'Project', group: 'Projects' },
  // Other
  { key: 'type', label: 'Income / Expense', group: 'Other' },
  { key: 'description', label: 'Description', group: 'Other' },
]

const DAY_ORDER: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
}

export function compareFieldValues(fieldKey: string, a: string, b: string): number {
  switch (fieldKey) {
    case 'month': {
      try {
        const da = parse(a, 'MMM yyyy', new Date())
        const db = parse(b, 'MMM yyyy', new Date())
        return da.getTime() - db.getTime()
      } catch {
        return a.localeCompare(b)
      }
    }
    case 'quarter': {
      // "Q1 2025" → compare year first, then quarter number
      const parseQ = (s: string) => {
        const m = s.match(/Q(\d)\s+(\d{4})/)
        if (!m) return 0
        return parseInt(m[2]) * 10 + parseInt(m[1])
      }
      return parseQ(a) - parseQ(b)
    }
    case 'year':
      return parseInt(a) - parseInt(b)
    case 'dayOfWeek': {
      const oa = DAY_ORDER[a] ?? 99
      const ob = DAY_ORDER[b] ?? 99
      return oa - ob
    }
    default:
      return a.localeCompare(b)
  }
}

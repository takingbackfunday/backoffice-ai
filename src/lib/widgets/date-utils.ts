import {
  startOfMonth, endOfMonth, subMonths, startOfYear,
  startOfWeek, startOfQuarter, format,
} from 'date-fns'
import type { DateRange, Granularity } from '@/types/widgets'

export function resolveDateRange(range: DateRange): { start: Date; end: Date } {
  const now = new Date()
  if (range.type === 'static') {
    return { start: new Date(range.start), end: new Date(range.end) }
  }
  const end = endOfMonth(now)
  switch (range.period) {
    case 'this-month': return { start: startOfMonth(now), end }
    case 'last-month': return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) }
    case 'last-3-months': return { start: startOfMonth(subMonths(now, 2)), end }
    case 'last-6-months': return { start: startOfMonth(subMonths(now, 5)), end }
    case 'last-12-months': return { start: startOfMonth(subMonths(now, 11)), end }
    case 'ytd': return { start: startOfYear(now), end }
    case 'all-time': return { start: new Date(2000, 0, 1), end }
    default: return { start: startOfMonth(subMonths(now, 5)), end }
  }
}

export function formatDateBucket(date: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'day': return format(date, 'yyyy-MM-dd')
    case 'week': return format(startOfWeek(date), 'yyyy-MM-dd')
    case 'month': return format(date, 'yyyy-MM')
    case 'quarter': return `${format(startOfQuarter(date), 'yyyy')}-Q${Math.ceil((date.getMonth() + 1) / 3)}`
    case 'year': return format(date, 'yyyy')
  }
}

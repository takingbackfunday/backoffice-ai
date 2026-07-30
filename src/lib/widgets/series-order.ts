import type { ChartDataPoint } from '@/types/widgets'

export function sortSeriesByTotal(data: ChartDataPoint[], seriesKeys: string[]): string[] {
  const totals = new Map<string, number>()
  for (const key of seriesKeys) {
    const total = data.reduce((sum, d) => {
      const value = d[key]
      return sum + (typeof value === 'number' ? value : 0)
    }, 0)
    totals.set(key, total)
  }
  return [...seriesKeys].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
}

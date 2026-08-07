import { mul, add } from '@/lib/money'

export function maxTagMargin(tags: string[], marginByTag: Map<string, number>): number {
  let max = 0
  for (const tag of tags) {
    const pct = marginByTag.get(tag)
    if (pct !== undefined && pct > max) max = pct
  }
  return max
}

export function autoPrice(
  costRate: number,
  tags: string[],
  marginByTag: Map<string, number>,
): number {
  const margin = maxTagMargin(tags, marginByTag)
  return round2(costRate * (1 + margin / 100))
}

export function itemMarginPercent(costRate: number | null, unitPrice: number): number | null {
  if (costRate == null || costRate <= 0) return null
  return round2(((unitPrice - costRate) / costRate) * 100)
}

export function quoteTotals(
  items: { quantity: number; unitPrice: number; costRate: number | null; isOptional: boolean }[],
): { totalCost: number; totalQuoted: number } {
  let totalCost = 0
  let totalQuoted = 0
  for (const item of items) {
    if (item.isOptional) continue
    totalQuoted = add(totalQuoted, mul(item.quantity, item.unitPrice)).toNumber()
    if (item.costRate != null && item.costRate > 0) {
      totalCost = add(totalCost, mul(item.quantity, item.costRate)).toNumber()
    }
  }
  return { totalCost: round2(totalCost), totalQuoted: round2(totalQuoted) }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

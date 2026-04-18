/**
 * FX rate utilities for dashboard currency conversion.
 *
 * All rates are stored EUR-based (ECB convention).
 * Cross-rates for USD↔GBP are derived: USD/GBP = (EUR/GBP) / (EUR/USD).
 *
 * If the requested month has no official rate yet, we carry forward the most
 * recent available rate.
 */

import { prisma } from '@/lib/prisma'

export type DashboardCurrency = 'USD' | 'EUR' | 'GBP'

/**
 * In-process cache keyed by `"FROM:TO:YYYY-MM"`.
 * Lives for the lifetime of the Node process (per Fly.io container).
 */
const rateCache = new Map<string, number>()

/**
 * Returns the conversion rate from `from` to `to` for the given month.
 * Falls back to the most recent available rate if the month is not in the DB.
 *
 * @param from   Source currency code (e.g. 'USD')
 * @param to     Target currency code (e.g. 'EUR')
 * @param month  'YYYY-MM' string for the transaction month
 */
export async function getRate(
  from: DashboardCurrency | string,
  to: DashboardCurrency | string,
  month: string,
): Promise<number> {
  if (from === to) return 1

  const cacheKey = `${from}:${to}:${month}`
  const cached = rateCache.get(cacheKey)
  if (cached !== undefined) return cached

  // Normalise: we only store EUR-base rows.
  // To convert X → Y we need EUR/X and EUR/Y rates.
  const eurToFrom = from === 'EUR' ? 1 : await lookupEurRate(from, month)
  const eurToTo = to === 'EUR' ? 1 : await lookupEurRate(to, month)

  // rate = (EUR→To) / (EUR→From)  i.e. how many To per 1 From
  const rate = eurToTo / eurToFrom

  rateCache.set(cacheKey, rate)
  return rate
}

/**
 * Look up the EUR → quote rate for a given month.
 * Queries the DB; if the month is missing, carries forward the latest.
 */
async function lookupEurRate(quote: string, month: string): Promise<number> {
  // Try exact month first
  const exact = await prisma.fxRate.findUnique({
    where: { month_base_quote: { month, base: 'EUR', quote } },
    select: { rate: true },
  })
  if (exact) return Number(exact.rate)

  // Carry-forward: find the most recent row before this month
  const latest = await prisma.fxRate.findFirst({
    where: { base: 'EUR', quote, month: { lte: month } },
    orderBy: { month: 'desc' },
    select: { rate: true },
  })
  if (latest) return Number(latest.rate)

  // Fallback: find any row (in case we're before all seeded data)
  const any = await prisma.fxRate.findFirst({
    where: { base: 'EUR', quote },
    orderBy: { month: 'asc' },
    select: { rate: true },
  })
  if (any) return Number(any.rate)

  // Ultimate fallback: use hard-coded approximate rates
  const fallbacks: Record<string, number> = { USD: 1.1, GBP: 0.86 }
  return fallbacks[quote] ?? 1
}

/**
 * Batch-convert an array of amounts in one DB round-trip per distinct
 * (sourceCurrency, month) pair. Much more efficient than calling getRate()
 * per row when processing large transaction sets.
 *
 * @param rows        Array of { amount, currency, month } objects
 * @param targetCurrency  The display currency to convert everything into
 * @returns           Converted amounts in the same order as `rows`
 */
export async function convertAmounts(
  rows: { amount: number; currency: string; month: string }[],
  targetCurrency: DashboardCurrency | string,
): Promise<number[]> {
  if (rows.length === 0) return []

  // Collect distinct (currency, month) pairs that need rates
  const pairs = new Set<string>()
  for (const r of rows) {
    if (r.currency !== targetCurrency) {
      pairs.add(`${r.currency}:${r.month}`)
    }
  }

  // Prefetch all needed rates in parallel
  await Promise.all(
    [...pairs].map(async (key) => {
      const [currency, month] = key.split(':')
      await getRate(currency, targetCurrency, month)
    }),
  )

  // All rates are now cached — synchronous lookup is safe
  return rows.map((r) => {
    if (r.currency === targetCurrency) return r.amount
    const rate = rateCache.get(`${r.currency}:${targetCurrency}:${r.month}`)
    // rate should always be present after the prefetch above
    return r.amount * (rate ?? 1)
  })
}

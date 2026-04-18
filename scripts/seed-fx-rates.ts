#!/usr/bin/env tsx
/**
 * Seed historical EUR/USD and EUR/GBP monthly exchange rates from 2000-01 to
 * the most recently completed month using the Frankfurter.app API (free, no key,
 * wraps official ECB data).
 *
 * Usage: npx tsx scripts/seed-fx-rates.ts
 *
 * Idempotent — uses upsert, safe to re-run.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://neondb_owner:npg_NGJVWsFuk58h@ep-super-wave-alq120gl.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
process.env.DIRECT_URL =
  process.env.DIRECT_URL ??
  'postgresql://neondb_owner:npg_NGJVWsFuk58h@ep-super-wave-alq120gl.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_URL! })
const prisma = new PrismaClient({ adapter } as never)

/** Returns 'YYYY-MM' for the last fully completed month */
function lastCompletedMonth(): string {
  const d = new Date()
  d.setDate(1) // first of current month
  d.setMonth(d.getMonth() - 1) // go back one month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>
}

/** Fetch monthly EUR-base rates from Frankfurter in chunks to avoid rate limits */
async function fetchRates(
  startYear: number,
  endYear: number,
): Promise<{ month: string; usd: number; gbp: number }[]> {
  // Frankfurter returns monthly data when resolution=monthly
  const start = `${startYear}-01-01`
  const end = `${endYear}-12-31`

  const url = `https://api.frankfurter.app/${start}..${end}?base=EUR&symbols=USD,GBP`
  console.log(`  Fetching ${startYear}–${endYear}…`)

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Frankfurter fetch failed: ${res.status} ${await res.text()}`)
  }

  const json = (await res.json()) as FrankfurterResponse

  // Frankfurter returns daily data; we want the last trading day of each month
  const monthlyMap = new Map<string, { usd: number; gbp: number }>()

  for (const [dateStr, rates] of Object.entries(json.rates)) {
    const month = dateStr.slice(0, 7) // 'YYYY-MM'
    const usd = rates['USD']
    const gbp = rates['GBP']
    if (usd && gbp) {
      // Last date in the month wins (entries are ordered ascending)
      monthlyMap.set(month, { usd, gbp })
    }
  }

  return [...monthlyMap.entries()].map(([month, { usd, gbp }]) => ({
    month,
    usd,
    gbp,
  }))
}

async function main() {
  console.log('Seeding FX rates (EUR/USD, EUR/GBP) from 2000 to present…\n')

  const endMonth = lastCompletedMonth()
  const endYear = parseInt(endMonth.slice(0, 4))

  // Fetch in 5-year chunks to stay well within Frankfurter limits
  const allRows: { month: string; usd: number; gbp: number }[] = []

  for (let year = 2000; year <= endYear; year += 5) {
    const chunkEnd = Math.min(year + 4, endYear)
    try {
      const rows = await fetchRates(year, chunkEnd)
      allRows.push(...rows)
      // Polite pause between chunks
      await new Promise((r) => setTimeout(r, 500))
    } catch (err) {
      console.error(`Failed chunk ${year}–${chunkEnd}:`, err)
      process.exit(1)
    }
  }

  // Filter to only months up to endMonth
  const filtered = allRows.filter((r) => r.month <= endMonth)

  console.log(`\nUpserting ${filtered.length} monthly rate pairs into DB…`)

  // Batch upserts — Neon WebSocket transport handles these fine
  let inserted = 0
  for (const row of filtered) {
    await prisma.fxRate.upsert({
      where: { month_base_quote: { month: row.month, base: 'EUR', quote: 'USD' } },
      update: { rate: row.usd, isOfficial: true },
      create: { month: row.month, base: 'EUR', quote: 'USD', rate: row.usd, isOfficial: true },
    })
    await prisma.fxRate.upsert({
      where: { month_base_quote: { month: row.month, base: 'EUR', quote: 'GBP' } },
      update: { rate: row.gbp, isOfficial: true },
      create: { month: row.month, base: 'EUR', quote: 'GBP', rate: row.gbp, isOfficial: true },
    })
    inserted += 2
  }

  console.log(`Done — upserted ${inserted} rows (${filtered.length} months × 2 pairs).`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

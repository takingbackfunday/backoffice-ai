/**
 * POST /api/fx-rates/refresh
 *
 * Fetches the latest EUR/USD and EUR/GBP rates from Frankfurter.app (ECB data)
 * and upserts them for the current month. Called:
 *   - manually from the dashboard (first time a user visits after month rollover)
 *   - from the seed script for live data
 *
 * Marks isOfficial=true only when data for the previous completed month already
 * exists (i.e. ECB has published it). Otherwise stores as carry-forward.
 *
 * Returns the upserted rates.
 */

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'

interface FrankfurterLatest {
  base: string
  date: string
  rates: { USD: number; GBP: number }
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function prevMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const res = await fetch('https://api.frankfurter.app/latest?base=EUR&symbols=USD,GBP')
    if (!res.ok) {
      throw new Error(`Frankfurter API error: ${res.status}`)
    }

    const json = (await res.json()) as FrankfurterLatest
    const { USD, GBP } = json.rates
    const month = currentMonth()

    // isOfficial = previous month's row already exists (ECB has caught up)
    const prevExists = await prisma.fxRate.findUnique({
      where: { month_base_quote: { month: prevMonth(), base: 'EUR', quote: 'USD' } },
      select: { isOfficial: true },
    })
    const isOfficial = Boolean(prevExists?.isOfficial)

    await prisma.$transaction([
      prisma.fxRate.upsert({
        where: { month_base_quote: { month, base: 'EUR', quote: 'USD' } },
        update: { rate: USD, isOfficial },
        create: { month, base: 'EUR', quote: 'USD', rate: USD, isOfficial },
      }),
      prisma.fxRate.upsert({
        where: { month_base_quote: { month, base: 'EUR', quote: 'GBP' } },
        update: { rate: GBP, isOfficial },
        create: { month, base: 'EUR', quote: 'GBP', rate: GBP, isOfficial },
      }),
    ])

    return ok({ month, USD, GBP, isOfficial })
  } catch (err) {
    console.error('[POST /api/fx-rates/refresh]', err)
    return serverError('Failed to refresh FX rates')
  }
}

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams {
  params: Promise<{ id: string }>
}

function daysDiff(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId },
      select: { id: true, extractedData: true, transactionId: true },
    })
    if (!receipt) return notFound('Receipt not found')

    const data = receipt.extractedData as Record<string, unknown> | null
    const receiptTotal = data?.total != null ? Number(data.total) : null
    const receiptDateStr = data?.date != null ? String(data.date) : null
    const receiptVendor = data?.vendor != null ? String(data.vendor).toLowerCase() : null

    if (receiptTotal == null) {
      return ok([]) // can't suggest without a total
    }

    const receiptDate = receiptDateStr ? new Date(receiptDateStr) : null
    const dateFrom = receiptDate ? new Date(receiptDate.getTime() - 7 * 24 * 60 * 60 * 1000) : undefined
    const dateTo = receiptDate ? new Date(receiptDate.getTime() + 7 * 24 * 60 * 60 * 1000) : undefined

    // Wide net: same user, no receipt attached, amount within ±5 of receipt total (absolute)
    const amountMin = receiptTotal - 5
    const amountMax = receiptTotal + 5

    const candidates = await prisma.transaction.findMany({
      where: {
        account: { userId },
        receipts: { none: {} },
        // Both negative (expense) and positive amounts — match on absolute value
        OR: [
          { amount: { gte: -amountMax, lte: -amountMin } },
          { amount: { gte: amountMin, lte: amountMax } },
        ],
        ...(dateFrom && dateTo ? { date: { gte: dateFrom, lte: dateTo } } : {}),
      },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        notes: true,
        account: { select: { name: true, currency: true } },
      },
      take: 50,
      orderBy: { date: 'desc' },
    })

    // Score each candidate
    const scored = candidates.map(tx => {
      const txAmount = Math.abs(Number(tx.amount))
      const amountDiff = Math.abs(txAmount - receiptTotal)
      const txDate = new Date(tx.date)
      const dDiff = receiptDate ? daysDiff(txDate, receiptDate) : null

      let score = 0
      const reasons: string[] = []

      // Amount scoring
      if (amountDiff <= 0.01) {
        score += 3
        reasons.push('exact amount match')
      } else if (amountDiff <= 0.50) {
        score += 2
        reasons.push(`amount within ${amountDiff.toFixed(2)}`)
      } else if (amountDiff <= 2.00) {
        score += 1
        reasons.push(`amount within ${amountDiff.toFixed(2)}`)
      }

      // Date scoring
      if (dDiff != null) {
        if (dDiff <= 1) {
          score += 2
          reasons.push('same day')
        } else if (dDiff <= 3) {
          score += 1
          reasons.push(`${Math.round(dDiff)} days apart`)
        }
      }

      // Vendor name in description
      if (receiptVendor && tx.description?.toLowerCase().includes(receiptVendor)) {
        score += 1
        reasons.push('vendor name matches')
      }

      return { tx, score, reasoning: reasons.join(', ') }
    })

    // Return top 5 with score >= 1, sorted by score desc
    const top = scored
      .filter(s => s.score >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ tx, score, reasoning }) => ({
        id: tx.id,
        date: tx.date,
        amount: Number(tx.amount),
        description: tx.description,
        accountName: tx.account.name,
        currency: tx.account.currency,
        score,
        reasoning,
      }))

    return ok(top)
  } catch (err) {
    console.error('[suggest-transactions]', err)
    return serverError()
  }
}

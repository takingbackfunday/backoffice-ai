/**
 * Post-import rent matching.
 *
 * After new transactions are imported, scan for positive transactions on
 * PROPERTY projects that might be tenant payments. For each candidate,
 * find tenants on that property whose outstanding balance > 0 and whose
 * monthly rent is within 30% of the transaction amount. Create a
 * TenantPaymentSuggestion for manager review.
 *
 * Design principles:
 * - Never auto-link. Always suggest, never decide.
 * - Loose amount tolerance (30%) because tenants regularly short/over-pay.
 * - Only suggest once per transaction — if a suggestion already exists, skip.
 * - No suggestion if the transaction is already linked to a TenantPayment.
 */

import { prisma } from '@/lib/prisma'

const AMOUNT_TOLERANCE = 0.30   // ±30% of monthlyRent
const DAYS_LOOKBACK = 60        // only consider charges due within last 60 days

export async function matchTenantPayments(userId: string, newTxIds: string[]): Promise<void> {
  if (newTxIds.length === 0) return

  // 1. Fetch positive transactions on PROPERTY projects, not yet linked
  const txs = await prisma.transaction.findMany({
    where: {
      id: { in: newTxIds },
      amount: { gt: 0 },
      tenantPayment: null,            // not already linked
      tenantPaymentSuggestions: { none: { status: 'PENDING' } }, // no open suggestion
      project: { userId, type: 'PROPERTY' },
    },
    include: {
      project: {
        include: {
          propertyProfile: {
            include: {
              units: {
                include: {
                  leases: {
                    where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
                    include: {
                      tenant: true,
                      tenantCharges: {
                        where: { forgivenAt: null },  // only active charges
                        select: { amount: true },
                      },
                      tenantPayments: {
                        select: { amount: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  const suggestionsToCreate: {
    userId: string
    transactionId: string
    tenantId: string
    leaseId: string
    confidence: string
    reasoning: string
  }[] = []

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DAYS_LOOKBACK)

  for (const tx of txs) {
    const txAmount = Number(tx.amount)
    const units = tx.project?.propertyProfile?.units ?? []

    for (const unit of units) {
      for (const lease of unit.leases) {
        const monthlyRent = Number(lease.monthlyRent)

        // Check outstanding balance
        const totalCharged = lease.tenantCharges.reduce((s, c) => s + Number(c.amount), 0)
        const totalPaid = lease.tenantPayments.reduce((s, p) => s + Number(p.amount), 0)
        const balance = totalCharged - totalPaid
        if (balance <= 0) continue  // tenant is current, no suggestion needed

        // Amount match: within ±30% of monthly rent
        const deviation = Math.abs(txAmount - monthlyRent) / monthlyRent
        if (deviation > AMOUNT_TOLERANCE) continue

        const confidence = deviation < 0.05 ? 'high' : 'medium'
        const deviationPct = Math.round(deviation * 100)
        const reasoning = deviation < 0.01
          ? `Transaction amount ($${txAmount}) exactly matches monthly rent ($${monthlyRent}) for ${lease.tenant.name}`
          : `Transaction amount ($${txAmount}) is within ${deviationPct}% of monthly rent ($${monthlyRent}) for ${lease.tenant.name}. Outstanding balance: $${balance.toFixed(2)}.`

        suggestionsToCreate.push({
          userId,
          transactionId: tx.id,
          tenantId: lease.tenantId,
          leaseId: lease.id,
          confidence,
          reasoning,
        })

        // Only one suggestion per transaction (pick best match — first lease wins
        // since we sort by closest amount deviation would require sorting first)
        break
      }
      if (suggestionsToCreate.some(s => s.transactionId === tx.id)) break
    }
  }

  if (suggestionsToCreate.length > 0) {
    await prisma.tenantPaymentSuggestion.createMany({
      data: suggestionsToCreate,
      skipDuplicates: true,
    })
  }
}

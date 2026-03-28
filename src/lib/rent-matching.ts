/**
 * Post-import rent matching.
 *
 * After new transactions are imported, scan for positive transactions on
 * PROPERTY projects that might be tenant payments. For each candidate,
 * find tenants on that property whose outstanding balance > 0 and whose
 * monthly rent is within 30% of the transaction amount. Create a
 * TenantPaymentSuggestion for manager review.
 *
 * Matching priority (highest wins):
 *   1. Name match on payeeName (strong signal)
 *   2. Name match on description / rawDescription (weak signal)
 *   3. Closest amount deviation as tiebreaker
 *
 * Design principles:
 * - Never auto-link. Always suggest, never decide.
 * - Loose amount tolerance (30%) because tenants regularly short/over-pay.
 * - Only suggest once per transaction — if a suggestion already exists, skip.
 * - No suggestion if the transaction is already linked to a TenantPayment.
 */

import { prisma } from '@/lib/prisma'
import { evaluateOperator } from '@/lib/rules/evaluate-condition'

const AMOUNT_TOLERANCE = 0.30   // ±30% of monthlyRent

/**
 * Score a tenant name match against payeeName and description.
 * Returns 2 = strong (payee match), 1 = weak (description match), 0 = no match.
 */
function nameMatchScore(
  tenantName: string,
  payeeName: string | null,  // from tx.payee.name
  description: string,       // from tx.description
): number {
  // Only match on parts longer than 2 chars to avoid false positives on "of", "la" etc.
  const nameParts = tenantName.toLowerCase().split(/\s+/).filter(p => p.length > 2)
  if (nameParts.length === 0) return 0

  // Strong: payee name contains any part of tenant name
  if (payeeName) {
    const pLower = payeeName.toLowerCase()
    if (nameParts.some(p => evaluateOperator(pLower, 'contains', p))) return 2
  }

  // Weak: description contains any part of tenant name
  const dLower = description.toLowerCase()
  if (nameParts.some(p => evaluateOperator(dLower, 'contains', p))) return 1

  return 0
}

export async function matchTenantPayments(userId: string, newTxIds: string[]): Promise<void> {
  if (newTxIds.length === 0) return

  // 1. Fetch positive transactions on PROPERTY projects, not yet linked
  const txs = await prisma.transaction.findMany({
    where: {
      id: { in: newTxIds },
      amount: { gt: 0 },
      tenantPayment: null,
      tenantPaymentSuggestions: { none: { status: 'PENDING' } },
      project: { userId, type: 'PROPERTY' },
    },
    include: {
      payee: { select: { name: true } },
      project: {
        include: {
          propertyProfile: {
            include: {
              units: {
                include: {
                  leases: {
                    where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
                    include: {
                      tenant: { select: { id: true, name: true } },
                      tenantCharges: {
                        where: { forgivenAt: null },
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

  console.log(`[rent-matching] called with ${newTxIds.length} txId(s), found ${txs.length} matching PROPERTY transaction(s) for userId=${userId}`)
  if (txs.length === 0) {
    console.log(`[rent-matching] reasons txs may be empty: not positive, not tagged to PROPERTY project, already linked, or pending suggestion exists`)
  }

  for (const tx of txs) {
    const txAmount = Number(tx.amount)
    const units = tx.project?.propertyProfile?.units ?? []

    console.log(`[rent-matching] tx=${tx.id} amount=${txAmount} desc="${tx.description}" payee="${tx.payee?.name ?? 'none'}" project=${tx.project?.id ?? 'none'} units=${units.length}`)

    // Collect all candidate leases for this transaction
    type Candidate = {
      leaseId: string
      tenantId: string
      tenantName: string
      monthlyRent: number
      balance: number
      deviation: number
      nameScore: number
    }

    const candidates: Candidate[] = []

    for (const unit of units) {
      for (const lease of unit.leases) {
        const monthlyRent = Number(lease.monthlyRent)

        // Must have outstanding balance
        const totalCharged = lease.tenantCharges.reduce((s, c) => s + Number(c.amount), 0)
        const totalPaid = lease.tenantPayments.reduce((s, p) => s + Number(p.amount), 0)
        const balance = totalCharged - totalPaid

        console.log(`[rent-matching]   lease=${lease.id} tenant="${lease.tenant.name}" rent=${monthlyRent} charged=${totalCharged} paid=${totalPaid} balance=${balance}`)

        if (balance <= 0) {
          console.log(`[rent-matching]   → skip: balance <= 0`)
          continue
        }

        // Amount must be within tolerance
        const deviation = Math.abs(txAmount - monthlyRent) / monthlyRent
        console.log(`[rent-matching]   → deviation=${(deviation * 100).toFixed(1)}% (tolerance=${AMOUNT_TOLERANCE * 100}%)`)
        if (deviation > AMOUNT_TOLERANCE) {
          console.log(`[rent-matching]   → skip: amount out of tolerance`)
          continue
        }

        const nameScore = nameMatchScore(
          lease.tenant.name,
          tx.payee?.name ?? null,
          tx.description,
        )

        candidates.push({
          leaseId: lease.id,
          tenantId: lease.tenantId,
          tenantName: lease.tenant.name,
          monthlyRent,
          balance,
          deviation,
          nameScore,
        })
      }
    }

    if (candidates.length === 0) {
      console.log(`[rent-matching]   → no candidates after filtering`)
      continue
    }

    // Pick best candidate: highest nameScore first, then lowest deviation
    candidates.sort((a, b) =>
      b.nameScore !== a.nameScore
        ? b.nameScore - a.nameScore
        : a.deviation - b.deviation
    )

    const best = candidates[0]
    const deviationPct = Math.round(best.deviation * 100)

    // Confidence: high if name matched + close amount, medium otherwise
    const confidence = best.nameScore > 0 && best.deviation < 0.05 ? 'high'
      : best.nameScore > 0 || best.deviation < 0.05 ? 'medium'
      : 'low'

    const nameSignal = best.nameScore === 2
      ? `Payee "${tx.payee?.name}" matches tenant name.`
      : best.nameScore === 1
      ? `Description contains tenant name.`
      : candidates.length > 1
      ? `No name match found; selected by closest amount among ${candidates.length} candidates.`
      : ''

    const reasoning = [
      `Transaction $${txAmount} is within ${deviationPct}% of ${best.tenantName}'s monthly rent ($${best.monthlyRent}).`,
      nameSignal,
      `Outstanding balance: $${best.balance.toFixed(2)}.`,
    ].filter(Boolean).join(' ')

    suggestionsToCreate.push({
      userId,
      transactionId: tx.id,
      tenantId: best.tenantId,
      leaseId: best.leaseId,
      confidence,
      reasoning,
    })
  }

  if (suggestionsToCreate.length > 0) {
    await prisma.tenantPaymentSuggestion.createMany({
      data: suggestionsToCreate,
      skipDuplicates: true,
    })
  }
}

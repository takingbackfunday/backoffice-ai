/**
 * Post-import rent matching.
 *
 * After new transactions are imported/created, scan for positive transactions
 * on PROPERTY projects and match them to tenants by name.
 *
 * Matching logic:
 *   1. Transaction must be positive and tagged to a PROPERTY project
 *   2. Not already linked to a TenantPayment
 *   3. No existing PENDING suggestion
 *   4. Match tenant name against payee name (strong) or description (weak)
 *   5. Tenant must belong to the same property (any lease status, or no lease)
 *   6. No amount filtering — tenants pay partial, early, or combined amounts
 *   7. No balance check — payments may arrive before charges are levied
 *
 * Design principles:
 * - Never auto-link. Always suggest, never decide.
 * - Name is the only reliable signal.
 * - One suggestion per transaction (best name match wins).
 */

import { prisma } from '@/lib/prisma'
import { evaluateOperator } from '@/lib/rules/evaluate-condition'

/**
 * Score a tenant name match against payee name and description.
 * Returns 2 = strong (payee match), 1 = weak (description match), 0 = no match.
 */
function nameMatchScore(
  tenantName: string,
  payeeName: string | null,
  description: string,
): number {
  const nameParts = tenantName.toLowerCase().split(/\s+/).filter(p => p.length > 2)
  if (nameParts.length === 0) return 0

  if (payeeName) {
    const pLower = payeeName.toLowerCase()
    if (nameParts.some(p => evaluateOperator(pLower, 'contains', p))) return 2
  }

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
              // All tenants on this property via any lease (any status)
              units: {
                include: {
                  leases: {
                    include: {
                      tenant: { select: { id: true, name: true } },
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

  console.log(`[rent-matching] called with ${newTxIds.length} txId(s), found ${txs.length} matching PROPERTY transaction(s) for userId=${userId}`)
  if (txs.length === 0) {
    console.log(`[rent-matching] possible reasons: not positive, not tagged to PROPERTY project, already linked, or pending suggestion exists`)
  }

  const suggestionsToCreate: {
    userId: string
    transactionId: string
    tenantId: string
    leaseId?: string
    confidence: string
    reasoning: string
  }[] = []

  for (const tx of txs) {
    const txAmount = Number(tx.amount)
    const units = tx.project?.propertyProfile?.units ?? []

    console.log(`[rent-matching] tx=${tx.id} amount=${txAmount} desc="${tx.description}" payee="${tx.payee?.name ?? 'none'}" units=${units.length}`)

    // Collect all tenants on this property (deduplicated by tenantId)
    const seen = new Set<string>()
    const candidates: { tenantId: string; leaseId?: string; tenantName: string; nameScore: number }[] = []

    for (const unit of units) {
      for (const lease of unit.leases) {
        if (seen.has(lease.tenantId)) continue
        seen.add(lease.tenantId)

        const score = nameMatchScore(
          lease.tenant.name,
          tx.payee?.name ?? null,
          tx.description,
        )

        console.log(`[rent-matching]   tenant="${lease.tenant.name}" nameScore=${score}`)

        if (score === 0) continue

        candidates.push({
          tenantId: lease.tenantId,
          leaseId: lease.id,
          tenantName: lease.tenant.name,
          nameScore: score,
        })
      }
    }

    if (candidates.length === 0) {
      console.log(`[rent-matching]   → no name match found, no suggestion created`)
      continue
    }

    // Pick strongest name match
    candidates.sort((a, b) => b.nameScore - a.nameScore)
    const best = candidates[0]

    const confidence = best.nameScore === 2 ? 'high' : 'medium'
    const reasoning = best.nameScore === 2
      ? `Payee "${tx.payee?.name}" matches tenant name "${best.tenantName}". Transaction: $${txAmount}.`
      : `Transaction description contains tenant name "${best.tenantName}". Amount: $${txAmount}.`

    console.log(`[rent-matching]   → matched to "${best.tenantName}" (confidence=${confidence})`)

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
    console.log(`[rent-matching] created ${suggestionsToCreate.length} suggestion(s)`)
  }
}

/**
 * Post-import invoice payment matching.
 *
 * After new transactions are imported/created, scan for positive transactions
 * on CLIENT or PROPERTY projects and try to match them to open invoices by amount.
 *
 * Matching logic:
 *   1. Transaction must be positive and tagged to a CLIENT or PROPERTY project
 *   2. Not already linked to an InvoicePayment
 *   3. No existing PENDING suggestion for this transaction
 *   4. Find open invoices (SENT/PARTIAL/OVERDUE) for the project
 *      - CLIENT: invoices via clientProfile
 *      - PROPERTY: invoices via leases on this property OR applicants on this property
 *   5. Compute each invoice's outstanding balance (total - paid)
 *   6. HIGH confidence triggers (auto-apply):
 *      a. Exact amount match (±0.01) against exactly one open invoice
 *      b. Invoice number appears in the transaction description or notes
 *   7. MEDIUM confidence — create one suggestion per open invoice so the
 *      user can choose which invoice to apply the payment to
 *
 * Design principles:
 * - HIGH confidence = auto-apply atomically
 * - MEDIUM confidence = one suggestion per open invoice (user picks)
 * - DRAFT invoices are always downgraded to MEDIUM — user must confirm
 */

import Decimal from 'decimal.js'
import { prisma } from '@/lib/prisma'
import { money, computeInvoiceTotals, isClose, MATCH_TOLERANCE, fmtMoney, Money } from '@/lib/money'

export type OpenInvoice = {
  id: string
  invoiceNumber: string
  status: string
  lineItems: { quantity: Decimal.Value; unitPrice: Decimal.Value; forgivenAt?: Date | null }[]
  payments: { amount: Decimal.Value; voidedAt?: Date | null }[]
}

export type Suggestion = {
  userId: string
  transactionId: string
  invoiceId: string
  confidence: 'medium'
  reasoning: string
}

/**
 * Pure matching logic — no Prisma I/O. Given a transaction and open invoices,
 * compute suggestions for payment application.
 */
export function matchTransactionToInvoices(opts: {
  txId: string
  txAmount: Decimal.Value
  txDescription: string | null
  txNotes: string | null
  openInvoices: OpenInvoice[]
  alreadySuggestedIds: Set<string>
  userId: string
}): Suggestion[] {
  const { txId, txAmount, txDescription, txNotes, openInvoices, alreadySuggestedIds, userId } = opts
  const txAmountDec = money(txAmount)
  const suggestions: Suggestion[] = []

  if (openInvoices.length === 0) return suggestions

  const txDesc = `${txDescription ?? ''} ${txNotes ?? ''}`.toLowerCase()

  const invoicesWithBalance = openInvoices.map(inv => {
    const { total, paid } = computeInvoiceTotals(inv)
    const balance = total.minus(paid)
    return { inv, total, paid, balance }
  })

  // Check for invoice number reference in transaction text (HIGH confidence signal)
  const invoiceNumberMatch = invoicesWithBalance.find(({ inv }) =>
    inv.invoiceNumber && txDesc.includes(inv.invoiceNumber.toLowerCase())
  )

  // Exact amount match (±0.01)
  const exactMatches = invoicesWithBalance.filter(({ balance }) => isClose(balance, txAmountDec))

  // HIGH confidence: invoice number in description, or single exact amount match
  const highConfidenceTarget = invoiceNumberMatch ?? (exactMatches.length === 1 ? exactMatches[0] : null)

  // Downgrade to MEDIUM if the matched invoice is still DRAFT — user must confirm
  if (highConfidenceTarget && highConfidenceTarget.inv.status === 'DRAFT') {
    const { inv: fi, balance } = highConfidenceTarget
    suggestions.push({
      userId,
      transactionId: txId,
      invoiceId: fi.id,
      confidence: 'medium',
      reasoning: `Payment of ${fmtMoney(txAmountDec)} matches draft invoice ${fi.invoiceNumber} (balance ${fmtMoney(balance)}) — confirm to apply and activate the invoice.`,
    })
    return suggestions
  }

  if (highConfidenceTarget) {
    // For HIGH confidence, we return empty suggestions — the caller auto-applies
    return suggestions
  }

  // MEDIUM confidence — create one suggestion per open invoice so user can choose
  const missing = invoicesWithBalance.filter(({ inv: fi }) => !alreadySuggestedIds.has(fi.id))

  for (const { inv: fi, balance } of missing) {
    const diff = txAmountDec.minus(balance)
    const diffNote = isClose(diff, 0)
      ? 'exact balance match'
      : diff.gt(0)
        ? `${fmtMoney(diff.abs())} over balance`
        : `${fmtMoney(diff.abs())} under balance`

    suggestions.push({
      userId,
      transactionId: txId,
      invoiceId: fi.id,
      confidence: 'medium',
      reasoning: `Payment of ${fmtMoney(txAmountDec)} against ${fi.invoiceNumber} (balance ${fmtMoney(balance)}) — ${diffNote}.`,
    })
  }

  return suggestions
}

async function getOpenInvoicesForTransaction(tx: {
  id: string
  workspace: {
    type: string
    clientProfile?: {
      invoices: OpenInvoice[]
    } | null
    propertyProfile?: {
      units: {
        leases: {
          invoices: OpenInvoice[]
        }[]
      }[]
      applicants: {
        invoices: OpenInvoice[]
      }[]
    } | null
  } | null
}): Promise<OpenInvoice[]> {
  if (!tx.workspace) return []

  if (tx.workspace.type === 'CLIENT') {
    return tx.workspace.clientProfile?.invoices ?? []
  }

  if (tx.workspace.type === 'PROPERTY') {
    const pp = tx.workspace.propertyProfile
    if (!pp) return []
    const leaseInvoices = pp.units.flatMap(u => u.leases.flatMap(l => l.invoices))
    const applicantInvoices = pp.applicants.flatMap(a => a.invoices)
    return [...leaseInvoices, ...applicantInvoices]
  }

  return []
}

export async function matchInvoicePayments(userId: string, newTxIds: string[]): Promise<void> {
  if (newTxIds.length === 0) return

  const openInvoiceFilter = { status: { in: ['DRAFT', 'SENT', 'PARTIAL', 'OVERDUE'] as ('DRAFT' | 'SENT' | 'PARTIAL' | 'OVERDUE')[] } }
  const invoiceInclude = { lineItems: true, payments: true }

  // Fetch positive transactions on CLIENT or PROPERTY projects, not yet linked
  const txs = await prisma.transaction.findMany({
    where: {
      id: { in: newTxIds },
      amount: { gt: 0 },
      invoicePayment: null,
      workspace: { userId, type: { in: ['CLIENT', 'PROPERTY'] } },
    },
    include: {
      invoicePaymentSuggestions: {
        where: { status: 'PENDING' },
        select: { invoiceId: true },
      },
      workspace: {
        include: {
          // CLIENT path
          clientProfile: {
            include: {
              invoices: {
                where: openInvoiceFilter,
                include: invoiceInclude,
              },
            },
          },
          // PROPERTY path
          propertyProfile: {
            include: {
              units: {
                include: {
                  leases: {
                    include: {
                      invoices: {
                        where: openInvoiceFilter,
                        include: invoiceInclude,
                      },
                    },
                  },
                },
              },
              applicants: {
                include: {
                  invoices: {
                    where: openInvoiceFilter,
                    include: invoiceInclude,
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  console.log(`[invoice-matching] called with ${newTxIds.length} txId(s), found ${txs.length} matching transaction(s) for userId=${userId}`)
  if (txs.length === 0) {
    console.log(`[invoice-matching] possible reasons: not positive, not tagged to CLIENT/PROPERTY project, already linked, or pending suggestion exists`)
  }

  const suggestionsToCreate: {
    userId: string
    transactionId: string
    invoiceId: string
    confidence: string
    reasoning: string
  }[] = []

  for (const tx of txs) {
    const txAmount = money(tx.amount)
    const openInvoices = await getOpenInvoicesForTransaction(tx as Parameters<typeof getOpenInvoicesForTransaction>[0])

    console.log(`[invoice-matching] tx=${tx.id} amount=${txAmount.toFixed(2)} desc="${tx.description}" project.type=${tx.workspace?.type} openInvoices=${openInvoices.length}`)

    if (openInvoices.length === 0) {
      console.log(`[invoice-matching]   → no open invoices for this project, skipping`)
      continue
    }

    const alreadySuggestedIds = new Set(tx.invoicePaymentSuggestions.map(s => s.invoiceId))

    // Use pure matching logic to compute suggestions
    const pureSuggestions = matchTransactionToInvoices({
      txId: tx.id,
      txAmount: tx.amount,
      txDescription: tx.description,
      txNotes: tx.notes,
      openInvoices,
      alreadySuggestedIds,
      userId,
    })

    // Check for HIGH confidence match (invoice number or exact amount)
    const txDesc = `${tx.description ?? ''} ${tx.notes ?? ''}`.toLowerCase()
    const invoicesWithBalance = openInvoices.map(inv => {
      const { total, paid } = computeInvoiceTotals(inv)
      const balance = total.minus(paid)
      return { inv, total, paid, balance }
    })
    const invoiceNumberMatch = invoicesWithBalance.find(({ inv }) =>
      inv.invoiceNumber && txDesc.includes(inv.invoiceNumber.toLowerCase())
    )
    const exactMatches = invoicesWithBalance.filter(({ balance }) => isClose(balance, txAmount))
    const highConfidenceTarget = invoiceNumberMatch ?? (exactMatches.length === 1 ? exactMatches[0] : null)

    if (highConfidenceTarget && highConfidenceTarget.inv.status !== 'DRAFT') {
      // Auto-apply HIGH confidence matches
      const { inv } = highConfidenceTarget
      const reasoning = invoiceNumberMatch
        ? `Invoice number ${inv.invoiceNumber} found in transaction description. Auto-applied.`
        : `Transaction amount ${fmtMoney(txAmount)} exactly matches outstanding balance on ${inv.invoiceNumber}. Auto-applied.`

      console.log(`[invoice-matching]   → high confidence match on ${inv.invoiceNumber} (${invoiceNumberMatch ? 'invoice # in description' : 'exact amount'}), auto-applying`)

      try {
        await prisma.$transaction(async tx2 => {
          await tx2.invoicePayment.create({
            data: {
              invoiceId: inv.id,
              amount: tx.amount,
              paidDate: tx.date,
              transactionId: tx.id,
              notes: `Auto-matched via bank transaction (${invoiceNumberMatch ? 'invoice number in description' : 'exact amount match'})`,
            },
          })

          const { total: invTotal, paid: currentPaid } = computeInvoiceTotals({
            lineItems: inv.lineItems,
            payments: inv.payments,
          })
          const newTotalPaid = currentPaid.plus(txAmount)
          const newStatus = newTotalPaid.gte(invTotal.minus(MATCH_TOLERANCE)) ? 'PAID' : 'PARTIAL'

          await tx2.invoice.update({ where: { id: inv.id }, data: { status: newStatus } })
        })

        console.log(`[invoice-matching]   → auto-applied to ${inv.invoiceNumber}`)
      } catch {
        console.log(`[invoice-matching]   → auto-apply failed, falling back to suggestions`)
        for (const suggestion of pureSuggestions) {
          suggestionsToCreate.push(suggestion)
        }
      }
    } else {
      // Add MEDIUM suggestions from pure logic
      for (const suggestion of pureSuggestions) {
        suggestionsToCreate.push(suggestion)
      }
      console.log(`[invoice-matching]   → created ${pureSuggestions.length} MEDIUM suggestion(s)`)
    }
  }

  if (suggestionsToCreate.length > 0) {
    await prisma.invoicePaymentSuggestion.createMany({
      data: suggestionsToCreate,
      skipDuplicates: true,
    })
    console.log(`[invoice-matching] created ${suggestionsToCreate.length} suggestion(s) for manual review`)
  }
}

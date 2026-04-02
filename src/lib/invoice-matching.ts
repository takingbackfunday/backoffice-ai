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

import { prisma } from '@/lib/prisma'

type OpenInvoice = {
  id: string
  invoiceNumber: string
  status: string
  lineItems: { quantity: number | string; unitPrice: number | string }[]
  payments: { amount: number | string }[]
}

async function getOpenInvoicesForTransaction(tx: {
  id: string
  project: {
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
  if (!tx.project) return []

  if (tx.project.type === 'CLIENT') {
    return tx.project.clientProfile?.invoices ?? []
  }

  if (tx.project.type === 'PROPERTY') {
    const pp = tx.project.propertyProfile
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
      project: { userId, type: { in: ['CLIENT', 'PROPERTY'] } },
    },
    include: {
      invoicePaymentSuggestions: {
        where: { status: 'PENDING' },
        select: { invoiceId: true },
      },
      project: {
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
    const txAmount = Number(tx.amount)
    const openInvoices = await getOpenInvoicesForTransaction(tx as Parameters<typeof getOpenInvoicesForTransaction>[0])

    console.log(`[invoice-matching] tx=${tx.id} amount=${txAmount} desc="${tx.description}" project.type=${tx.project?.type} openInvoices=${openInvoices.length}`)

    if (openInvoices.length === 0) {
      console.log(`[invoice-matching]   → no open invoices for this project, skipping`)
      continue
    }

    // Skip invoices that already have a pending suggestion for this transaction
    const alreadySuggestedIds = new Set(tx.invoicePaymentSuggestions.map(s => s.invoiceId))

    // Compute outstanding balance per invoice
    const invoicesWithBalance = openInvoices.map(inv => {
      const total = inv.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const balance = total - paid
      return { inv, total, balance }
    })

    const txDesc = `${tx.description ?? ''} ${tx.notes ?? ''}`.toLowerCase()

    // Check for invoice number reference in transaction text (HIGH confidence signal)
    const invoiceNumberMatch = invoicesWithBalance.find(({ inv }) =>
      inv.invoiceNumber && txDesc.includes(inv.invoiceNumber.toLowerCase())
    )

    // Exact amount match (±0.01)
    const exactMatches = invoicesWithBalance.filter(({ balance }) => Math.abs(balance - txAmount) <= 0.01)

    // HIGH confidence: invoice number in description, or single exact amount match
    let highConfidenceTarget = invoiceNumberMatch ?? (exactMatches.length === 1 ? exactMatches[0] : null)

    // Downgrade to MEDIUM if the matched invoice is still DRAFT — user must confirm
    if (highConfidenceTarget && highConfidenceTarget.inv.status === 'DRAFT') {
      console.log(`[invoice-matching]   → high confidence target ${highConfidenceTarget.inv.invoiceNumber} is DRAFT — downgrading to MEDIUM suggestion`)
      const { inv: fi, balance } = highConfidenceTarget
      suggestionsToCreate.push({
        userId,
        transactionId: tx.id,
        invoiceId: fi.id,
        confidence: 'medium',
        reasoning: `Payment of ${txAmount.toFixed(2)} matches draft invoice ${fi.invoiceNumber} (balance ${balance.toFixed(2)}) — confirm to apply and activate the invoice.`,
      })
      highConfidenceTarget = null
      continue
    }

    if (highConfidenceTarget) {
      const { inv, total } = highConfidenceTarget
      const reasoning = invoiceNumberMatch
        ? `Invoice number ${inv.invoiceNumber} found in transaction description. Auto-applied.`
        : `Transaction amount ${txAmount} exactly matches outstanding balance on ${inv.invoiceNumber}. Auto-applied.`

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

          const currentPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
          const newTotalPaid = currentPaid + txAmount
          const newStatus = newTotalPaid >= total - 0.01 ? 'PAID' : 'PARTIAL'

          await tx2.invoice.update({ where: { id: inv.id }, data: { status: newStatus } })
        })

        console.log(`[invoice-matching]   → auto-applied to ${inv.invoiceNumber}`)
      } catch {
        console.log(`[invoice-matching]   → auto-apply failed, falling back to suggestions`)
        for (const { inv: fi, balance } of invoicesWithBalance.filter(({ inv: fi }) => !alreadySuggestedIds.has(fi.id))) {
          suggestionsToCreate.push({
            userId,
            transactionId: tx.id,
            invoiceId: fi.id,
            confidence: 'medium',
            reasoning: `Auto-apply failed — manual review needed. Invoice ${fi.invoiceNumber}, balance ${balance.toFixed(2)}.`,
          })
        }
      }
    } else {
      // MEDIUM confidence — create one suggestion per open invoice so user can choose
      const missing = invoicesWithBalance.filter(({ inv: fi }) => !alreadySuggestedIds.has(fi.id))
      console.log(`[invoice-matching]   → no high-confidence match, creating ${missing.length} new MEDIUM suggestion(s) (${alreadySuggestedIds.size} already exist)`)

      for (const { inv: fi, balance } of missing) {
        const diff = txAmount - balance
        const diffNote = Math.abs(diff) < 0.01
          ? 'exact balance match'
          : diff > 0
            ? `${Math.abs(diff).toFixed(2)} over balance`
            : `${Math.abs(diff).toFixed(2)} under balance`

        suggestionsToCreate.push({
          userId,
          transactionId: tx.id,
          invoiceId: fi.id,
          confidence: 'medium',
          reasoning: `Payment of ${txAmount.toFixed(2)} against ${fi.invoiceNumber} (balance ${balance.toFixed(2)}) — ${diffNote}.`,
        })
      }
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

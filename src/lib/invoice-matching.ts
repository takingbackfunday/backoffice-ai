/**
 * Post-import invoice payment matching.
 *
 * After new transactions are imported/created, scan for positive transactions
 * on CLIENT projects and try to match them to open invoices by amount.
 *
 * Matching logic:
 *   1. Transaction must be positive and tagged to a CLIENT project
 *   2. Not already linked to an InvoicePayment
 *   3. No existing PENDING suggestion for this transaction
 *   4. Find open invoices (SENT/PARTIAL/OVERDUE) for the client
 *   5. Compute each invoice's outstanding balance (total - paid)
 *   6. Exact match (±0.01) → auto-create InvoicePayment + update status
 *   7. No exact match but open invoices exist → create suggestion for best candidate
 *
 * Design principles:
 * - HIGH confidence (exact amount match) = auto-apply atomically
 * - MEDIUM confidence (client has invoices, no exact match) = suggest for review
 * - One suggestion per transaction (closest balance match wins)
 */

import { prisma } from '@/lib/prisma'

export async function matchInvoicePayments(userId: string, newTxIds: string[]): Promise<void> {
  if (newTxIds.length === 0) return

  // 1. Fetch positive transactions on CLIENT projects, not yet linked, no pending suggestion
  const txs = await prisma.transaction.findMany({
    where: {
      id: { in: newTxIds },
      amount: { gt: 0 },
      invoicePayment: null,
      invoicePaymentSuggestions: { none: { status: 'PENDING' } },
      project: { userId, type: 'CLIENT' },
    },
    include: {
      project: {
        include: {
          clientProfile: {
            include: {
              invoices: {
                where: { status: { in: ['DRAFT', 'SENT', 'PARTIAL', 'OVERDUE'] } },
                include: {
                  lineItems: true,
                  payments: true,
                },
              },
            },
          },
        },
      },
    },
  })

  console.log(`[invoice-matching] called with ${newTxIds.length} txId(s), found ${txs.length} matching CLIENT transaction(s) for userId=${userId}`)
  if (txs.length === 0) {
    console.log(`[invoice-matching] possible reasons: not positive, not tagged to CLIENT project, already linked, or pending suggestion exists`)
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
    const openInvoices = tx.project?.clientProfile?.invoices ?? []

    console.log(`[invoice-matching] tx=${tx.id} amount=${txAmount} desc="${tx.description}" openInvoices=${openInvoices.length}`)

    if (openInvoices.length === 0) {
      console.log(`[invoice-matching]   → no open invoices for this client, skipping`)
      continue
    }

    // Compute outstanding balance per invoice
    const invoicesWithBalance = openInvoices.map(inv => {
      const total = inv.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const balance = total - paid
      return { inv, total, balance }
    })

    // Look for exact match (±0.01)
    const exactMatches = invoicesWithBalance.filter(({ balance }) => Math.abs(balance - txAmount) <= 0.01)

    if (exactMatches.length === 1) {
      // HIGH confidence — auto-apply
      const { inv, total } = exactMatches[0]
      const reasoning = `Transaction amount ${txAmount} exactly matches outstanding balance on ${inv.invoiceNumber} (${total}). Auto-applied.`

      console.log(`[invoice-matching]   → exact match on ${inv.invoiceNumber}, auto-applying`)

      try {
        await prisma.$transaction(async tx2 => {
          // Create InvoicePayment linked to the transaction
          await tx2.invoicePayment.create({
            data: {
              invoiceId: inv.id,
              amount: tx.amount,
              paidDate: tx.date,
              transactionId: tx.id,
              notes: `Auto-matched via bank transaction (exact amount match)`,
            },
          })

          // Determine new status
          const currentPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
          const newTotalPaid = currentPaid + txAmount
          const newStatus = newTotalPaid >= total - 0.01 ? 'PAID' : 'PARTIAL'

          await tx2.invoice.update({
            where: { id: inv.id },
            data: { status: newStatus },
          })
        })

        console.log(`[invoice-matching]   → auto-applied to ${inv.invoiceNumber}`)
      } catch {
        // Auto-apply failed (e.g. duplicate) — fall back to suggestion
        console.log(`[invoice-matching]   → auto-apply failed, creating MEDIUM suggestion`)
        suggestionsToCreate.push({
          userId,
          transactionId: tx.id,
          invoiceId: inv.id,
          confidence: 'medium',
          reasoning: `Could not auto-apply — manual review needed. ${reasoning}`,
        })
      }
    } else {
      // MEDIUM confidence — pick closest balance invoice as suggestion
      invoicesWithBalance.sort((a, b) => Math.abs(a.balance - txAmount) - Math.abs(b.balance - txAmount))
      const best = invoicesWithBalance[0]
      const diff = Math.abs(best.balance - txAmount)

      const reasoning = exactMatches.length > 1
        ? `${exactMatches.length} invoices match this amount — manual selection required. Closest: ${best.inv.invoiceNumber} (balance ${best.balance.toFixed(2)}).`
        : `No exact amount match found. Closest open invoice: ${best.inv.invoiceNumber} with balance ${best.balance.toFixed(2)} vs transaction ${txAmount.toFixed(2)} (diff: ${diff.toFixed(2)}).`

      console.log(`[invoice-matching]   → no exact match, creating MEDIUM suggestion for ${best.inv.invoiceNumber}`)

      suggestionsToCreate.push({
        userId,
        transactionId: tx.id,
        invoiceId: best.inv.id,
        confidence: 'medium',
        reasoning,
      })
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

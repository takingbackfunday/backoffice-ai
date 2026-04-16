/**
 * Post-import receipt-transaction matching.
 *
 * After new transactions are imported/created, scan for unlinked receipts
 * and try to auto-link them to transactions by amount + date.
 *
 * Matching logic:
 *   1. Load all unlinked receipts (transactionId IS NULL, status != FAILED) for this user
 *   2. For each new transaction, compare against each unlinked receipt:
 *      - Amount: Math.abs(tx.amount) vs receipt.extractedData.total (±0.01 for HIGH)
 *      - Date: tx.date vs receipt.extractedData.date (±1 day for HIGH)
 *   3. HIGH confidence → auto-link receipt to transaction atomically
 *   4. Only link once per receipt and once per transaction (first HIGH match wins)
 *
 * For MEDIUM confidence suggestions, use GET /api/receipts/[id]/suggest-transactions
 * which scores candidates on demand — no extra DB model needed.
 */

import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

function daysDiff(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

export async function matchReceiptTransactions(userId: string, newTxIds: string[]): Promise<void> {
  if (newTxIds.length === 0) return

  // Load the new transactions
  const transactions = await prisma.transaction.findMany({
    where: {
      id: { in: newTxIds },
      account: { userId },
      receipts: { none: {} }, // not already linked to a receipt
    },
    select: { id: true, amount: true, date: true, description: true },
  })

  if (transactions.length === 0) return

  // Load all unlinked receipts for this user that have extractedData
  const receipts = await prisma.receipt.findMany({
    where: {
      userId,
      transactionId: null,
      status: { not: 'FAILED' },
      extractedData: { not: Prisma.AnyNull },
    },
    select: { id: true, extractedData: true },
  })

  if (receipts.length === 0) {
    console.log('[receipt-matching] no unlinked receipts to match against')
    return
  }

  console.log(`[receipt-matching] checking ${transactions.length} tx(s) against ${receipts.length} unlinked receipt(s)`)

  // Track which receipts have been linked this run to avoid double-linking
  const linkedReceiptIds = new Set<string>()
  const linkedTxIds = new Set<string>()

  for (const tx of transactions) {
    if (linkedTxIds.has(tx.id)) continue

    const txAmount = Math.abs(Number(tx.amount))
    const txDate = new Date(tx.date)

    for (const receipt of receipts) {
      if (linkedReceiptIds.has(receipt.id)) continue

      const data = receipt.extractedData as Record<string, unknown> | null
      if (!data) continue

      const receiptTotal = data.total != null ? Number(data.total) : null
      const receiptDateStr = data.date != null ? String(data.date) : null

      if (receiptTotal == null) continue

      const amountDiff = Math.abs(txAmount - receiptTotal)
      if (amountDiff > 0.01) continue // only HIGH confidence auto-links

      // Check date proximity
      if (receiptDateStr) {
        const receiptDate = new Date(receiptDateStr)
        if (isNaN(receiptDate.getTime())) continue
        if (daysDiff(txDate, receiptDate) > 1) continue
      }

      // HIGH confidence match — auto-link
      try {
        await prisma.receipt.update({
          where: { id: receipt.id },
          data: { transactionId: tx.id },
        })
        linkedReceiptIds.add(receipt.id)
        linkedTxIds.add(tx.id)
        console.log(`[receipt-matching] auto-linked receipt ${receipt.id} → tx ${tx.id} (amount=${txAmount}, diff=${amountDiff.toFixed(4)})`)
        break // one receipt per tx
      } catch (err) {
        console.error(`[receipt-matching] failed to link receipt ${receipt.id} → tx ${tx.id}:`, err)
      }
    }
  }
}

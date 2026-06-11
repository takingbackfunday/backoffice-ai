import Decimal from 'decimal.js'
import { prisma } from '@/lib/prisma'
import { InvoiceStatus } from '@/generated/prisma/client'
import { money, gte, gt, toDisplay, Money, computeInvoiceTotals } from '@/lib/money'

export { computeInvoiceTotals } from '@/lib/money'

interface InvoiceWithLineItemsAndPayments {
  lineItems: { quantity: Decimal.Value; unitPrice: Decimal.Value; forgivenAt?: Date | null }[]
  payments: { amount: Decimal.Value; voidedAt?: Date | null }[]
  status?: InvoiceStatus
  dueDate?: Date | string | null
}

export function deriveInvoiceStatus(
  invoice: InvoiceWithLineItemsAndPayments,
  now: Date = new Date(),
): InvoiceStatus {
  const stored = invoice.status
  if (stored === 'VOID' || stored === 'DRAFT') return stored

  const { total, paid } = computeInvoiceTotals(invoice)

  if (total.lte(0)) return 'VOID'
  if (paid.gte(total)) return 'PAID'
  if (paid.gt(0)) return 'PARTIAL'

  // Use date-only comparison to avoid timezone issues per CLAUDE.md gotcha
  const dueStr =
    typeof invoice.dueDate === 'string'
      ? invoice.dueDate.slice(0, 10)
      : invoice.dueDate
        ? invoice.dueDate.toISOString().slice(0, 10)
        : null
  const nowStr = now.toISOString().slice(0, 10)

  if (dueStr && dueStr < nowStr) return 'OVERDUE'
  return 'SENT'
}

export async function recalcInvoiceStatus(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lineItems: true, payments: true },
  })

  if (invoice.status === 'VOID' || invoice.status === 'DRAFT') return

  const { total, paid } = computeInvoiceTotals(invoice)

  let newStatus: InvoiceStatus
  if (total.lte(0)) newStatus = 'VOID'
  else if (paid.gte(total)) newStatus = 'PAID'
  else if (paid.gt(0)) newStatus = 'PARTIAL'
  else if (new Date(invoice.dueDate) < new Date()) newStatus = 'OVERDUE'
  else newStatus = 'SENT'

  if (newStatus !== invoice.status) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } })
  }
}

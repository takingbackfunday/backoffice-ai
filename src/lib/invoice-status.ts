import { prisma } from '@/lib/prisma'
import { InvoiceStatus } from '@/generated/prisma/client'

export async function recalcInvoiceStatus(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lineItems: true, payments: true },
  })
  if (invoice.status === 'VOID' || invoice.status === 'DRAFT') return

  const total = invoice.lineItems
    .filter(li => !li.forgivenAt)
    .reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0)
  const paid = invoice.payments
    .filter(p => !p.voidedAt)
    .reduce((s, p) => s + Number(p.amount), 0)

  let newStatus: InvoiceStatus
  if (total <= 0) newStatus = 'VOID'
  else if (paid >= total) newStatus = 'PAID'
  else if (paid > 0) newStatus = 'PARTIAL'
  else if (new Date(invoice.dueDate) < new Date()) newStatus = 'OVERDUE'
  else newStatus = 'SENT'

  if (newStatus !== invoice.status) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } })
  }
}

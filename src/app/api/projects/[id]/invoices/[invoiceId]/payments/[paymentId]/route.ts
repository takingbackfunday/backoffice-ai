import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { InvoiceStatus } from '@/generated/prisma/client'

interface RouteParams { params: Promise<{ id: string; invoiceId: string; paymentId: string }> }

// Shared ownership check — returns invoice with lineItems+payments, or null
async function getOwnedInvoice(userId: string, projectId: string, invoiceId: string) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      OR: [
        { clientProfile: { project: { id: projectId, userId } } },
        { lease: { unit: { propertyProfile: { project: { id: projectId, userId } } } } },
        { tenant: { userId, leases: { some: { unit: { propertyProfile: { project: { id: projectId, userId } } } } } } },
        { applicant: { propertyProfile: { project: { id: projectId, userId } } } },
      ],
    },
    include: { lineItems: true, payments: true },
  })
}

// Recompute and persist PAID / PARTIAL / SENT status after payments change
async function recalcStatus(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  invoiceId: string,
  currentStatus: string,
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true, payments: true },
  })
  if (!invoice) return
  const total = invoice.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)

  let newStatus: InvoiceStatus
  if (paid >= total - 0.001) {
    newStatus = InvoiceStatus.PAID
  } else if (paid > 0) {
    newStatus = InvoiceStatus.PARTIAL
  } else {
    // No payments left — revert to SENT unless it was DRAFT or VOID
    newStatus = ['DRAFT', 'VOID'].includes(currentStatus) ? (currentStatus as InvoiceStatus) : InvoiceStatus.SENT
  }

  await tx.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } })
}

// ── DELETE — remove a payment (refund) ────────────────────────────────────────
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId, paymentId } = await params

    const invoice = await getOwnedInvoice(userId, id, invoiceId)
    if (!invoice) return notFound('Invoice not found')
    if (invoice.status === 'VOID') return badRequest('Cannot modify payments on a voided invoice')

    const payment = invoice.payments.find(p => p.id === paymentId)
    if (!payment) return notFound('Payment not found')

    await prisma.$transaction(async tx => {
      await tx.invoicePayment.delete({ where: { id: paymentId } })
      await recalcStatus(tx, invoiceId, invoice.status)
    })

    return ok({ id: paymentId })
  } catch {
    return serverError('Failed to remove payment')
  }
}

// ── PATCH — move payment to a different invoice ───────────────────────────────
const MoveSchema = z.object({
  targetInvoiceId: z.string().min(1),
})

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId, paymentId } = await params

    const body = await req.json()
    const parsed = MoveSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const { targetInvoiceId } = parsed.data
    if (targetInvoiceId === invoiceId) return badRequest('Target invoice is the same as the current invoice')

    // Verify both invoices belong to this project+user
    const [sourceInvoice, targetInvoice] = await Promise.all([
      getOwnedInvoice(userId, id, invoiceId),
      getOwnedInvoice(userId, id, targetInvoiceId),
    ])

    if (!sourceInvoice) return notFound('Source invoice not found')
    if (!targetInvoice) return notFound('Target invoice not found')
    if (sourceInvoice.status === 'VOID') return badRequest('Cannot move payments from a voided invoice')
    if (targetInvoice.status === 'VOID') return badRequest('Cannot move payment to a voided invoice')
    if (targetInvoice.status === 'PAID') return badRequest('Target invoice is already fully paid')

    const payment = sourceInvoice.payments.find(p => p.id === paymentId)
    if (!payment) return notFound('Payment not found')

    // Check the payment doesn't exceed the target invoice's remaining balance
    const targetTotal = targetInvoice.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
    const targetPaid = targetInvoice.payments.reduce((s, p) => s + Number(p.amount), 0)
    const targetRemaining = targetTotal - targetPaid
    if (Number(payment.amount) > targetRemaining + 0.001) {
      return badRequest(
        `Payment amount (${Number(payment.amount).toFixed(2)}) exceeds remaining balance on target invoice (${targetRemaining.toFixed(2)})`
      )
    }

    await prisma.$transaction(async tx => {
      await tx.invoicePayment.update({
        where: { id: paymentId },
        data: { invoiceId: targetInvoiceId },
      })
      await recalcStatus(tx, invoiceId, sourceInvoice.status)
      await recalcStatus(tx, targetInvoiceId, targetInvoice.status)
    })

    return ok({ id: paymentId, targetInvoiceId })
  } catch {
    return serverError('Failed to move payment')
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { recalcInvoiceStatus } from '@/lib/invoice-status'

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

    await prisma.invoicePayment.delete({ where: { id: paymentId } })
    await recalcInvoiceStatus(invoiceId)

    return ok({ id: paymentId })
  } catch {
    return serverError('Failed to remove payment')
  }
}

// ── PATCH — void/restore OR move payment to a different invoice ───────────────
const VoidSchema = z.object({ action: z.literal('void'), reason: z.string().max(500).optional() })
const RestoreSchema = z.object({ action: z.literal('restore') })
const MoveSchema = z.object({ action: z.literal('move'), targetInvoiceId: z.string().min(1) })
const PatchSchema = z.discriminatedUnion('action', [VoidSchema, RestoreSchema, MoveSchema])

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId, paymentId } = await params

    const body = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    // Handle legacy move (no action field) for backwards compat
    if ('targetInvoiceId' in body && !('action' in body)) {
      return handleMove(userId, id, invoiceId, paymentId, body.targetInvoiceId)
    }

    const data = parsed.data

    if (data.action === 'void') {
      const invoice = await getOwnedInvoice(userId, id, invoiceId)
      if (!invoice) return notFound('Invoice not found')
      if (invoice.status === 'VOID') return badRequest('Cannot void payment on a voided invoice')
      const payment = invoice.payments.find(p => p.id === paymentId)
      if (!payment) return notFound('Payment not found')
      if (payment.voidedAt) return badRequest('Payment is already voided')

      await prisma.invoicePayment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date(), voidedBy: userId, voidReason: data.reason ?? null },
      })
      await recalcInvoiceStatus(invoiceId)
      return ok({ id: paymentId, action: 'void' })
    }

    if (data.action === 'restore') {
      const invoice = await getOwnedInvoice(userId, id, invoiceId)
      if (!invoice) return notFound('Invoice not found')
      const payment = invoice.payments.find(p => p.id === paymentId)
      if (!payment) return notFound('Payment not found')
      if (!payment.voidedAt) return badRequest('Payment is not voided')

      await prisma.invoicePayment.update({
        where: { id: paymentId },
        data: { voidedAt: null, voidedBy: null, voidReason: null },
      })
      await recalcInvoiceStatus(invoiceId)
      return ok({ id: paymentId, action: 'restore' })
    }

    if (data.action === 'move') {
      return handleMove(userId, id, invoiceId, paymentId, data.targetInvoiceId)
    }

    return badRequest('Invalid action')
  } catch {
    return serverError('Failed to update payment')
  }
}

async function handleMove(
  userId: string,
  projectId: string,
  invoiceId: string,
  paymentId: string,
  targetInvoiceId: string,
) {
  if (targetInvoiceId === invoiceId) return badRequest('Target invoice is the same as the current invoice')

  const [sourceInvoice, targetInvoice] = await Promise.all([
    prisma.invoice.findFirst({
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
    }),
    prisma.invoice.findFirst({
      where: {
        id: targetInvoiceId,
        OR: [
          { clientProfile: { project: { id: projectId, userId } } },
          { lease: { unit: { propertyProfile: { project: { id: projectId, userId } } } } },
          { tenant: { userId, leases: { some: { unit: { propertyProfile: { project: { id: projectId, userId } } } } } } },
          { applicant: { propertyProfile: { project: { id: projectId, userId } } } },
        ],
      },
      include: { lineItems: true, payments: true },
    }),
  ])

  if (!sourceInvoice) return notFound('Source invoice not found')
  if (!targetInvoice) return notFound('Target invoice not found')
  if (sourceInvoice.status === 'VOID') return badRequest('Cannot move payments from a voided invoice')
  if (targetInvoice.status === 'VOID') return badRequest('Cannot move payment to a voided invoice')
  if (targetInvoice.status === 'PAID') return badRequest('Target invoice is already fully paid')

  const payment = sourceInvoice.payments.find(p => p.id === paymentId)
  if (!payment) return notFound('Payment not found')

  const targetTotal = targetInvoice.lineItems
    .filter(li => !li.forgivenAt)
    .reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
  const targetPaid = targetInvoice.payments
    .filter(p => !p.voidedAt)
    .reduce((s, p) => s + Number(p.amount), 0)
  const targetRemaining = targetTotal - targetPaid

  if (Number(payment.amount) > targetRemaining + 0.001) {
    return badRequest(
      `Payment amount (${Number(payment.amount).toFixed(2)}) exceeds remaining balance on target invoice (${targetRemaining.toFixed(2)})`
    )
  }

  await prisma.invoicePayment.update({ where: { id: paymentId }, data: { invoiceId: targetInvoiceId } })
  await Promise.all([
    recalcInvoiceStatus(invoiceId),
    recalcInvoiceStatus(targetInvoiceId),
  ])

  return ok({ id: paymentId, targetInvoiceId })
}

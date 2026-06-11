import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { computeInvoiceTotals, gte, isClose, toDisplay, money } from '@/lib/money'

const CreatePaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  paidDate: z.string().min(1, 'Paid date is required'),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  transactionId: z.string().optional().nullable(),
})

interface RouteParams { params: Promise<{ id: string; invoiceId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        OR: [
          { clientProfile: { workspace: { id, userId } } },
          { lease: { unit: { propertyProfile: { workspace: { id, userId } } } } },
          { tenant: { userId, leases: { some: { unit: { propertyProfile: { workspace: { id, userId } } } } } } },
          { applicant: { propertyProfile: { workspace: { id, userId } } } },
        ],
      },
      include: {
        lineItems: true,
        payments: true,
      },
    })
    if (!invoice) return notFound('Invoice not found')
    if (invoice.status === 'VOID') return badRequest('Cannot record payment on a voided invoice')

    const body = await request.json()
    const parsed = CreatePaymentSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    // Compute invoice total and already paid (exclude forgiven items and voided payments)
    const { total: invoiceTotal, paid: alreadyPaid } = computeInvoiceTotals(invoice)
    const remaining = invoiceTotal.minus(alreadyPaid)

    if (money(parsed.data.amount).gt(remaining.plus(money('0.001')))) {
      return badRequest(`Payment amount (${parsed.data.amount.toFixed(2)}) exceeds remaining balance (${remaining.toFixed(2)})`)
    }

    // If linking to a transaction, verify it's unlinked and belongs to this project
    const txId = parsed.data.transactionId ?? null
    if (txId) {
      const linkedTx = await prisma.transaction.findFirst({
        where: { id: txId, workspace: { id } },
        include: { invoicePayment: true },
      })
      if (!linkedTx) return notFound('Transaction not found on this project')
      if (linkedTx.invoicePayment) return badRequest('Transaction is already linked to another payment')
    }

    const payment = await prisma.$transaction(async tx => {
      const p = await tx.invoicePayment.create({
        data: {
          invoiceId,
          amount: parsed.data.amount,
          paidDate: new Date(parsed.data.paidDate),
          paymentMethod: parsed.data.paymentMethod,
          notes: parsed.data.notes,
          ...(txId ? { transactionId: txId } : {}),
        },
      })

      // Auto-update invoice status
      const newPaid = alreadyPaid.plus(parsed.data.amount)
      const newStatus = newPaid.gte(invoiceTotal.minus(money('0.001'))) ? 'PAID' : 'PARTIAL'
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: newStatus },
      })

      // Dismiss any pending suggestion for this transaction
      if (txId) {
        await tx.invoicePaymentSuggestion.updateMany({
          where: { transactionId: txId, status: 'PENDING' },
          data: { status: 'DISMISSED' },
        })
      }

      return p
    })

    return ok(payment)
  } catch {
    return serverError('Failed to record payment')
  }
}

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { computeInvoiceTotals, money } from '@/lib/money'

const ParamsSchema = z.object({ id: z.string(), invoiceId: z.string() })

const CreatePaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  paidDate: z.string().min(1, 'Paid date is required'),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  transactionId: z.string().optional().nullable(),
})

export const POST = authedRoute<{ id: string; invoiceId: string }, z.infer<typeof CreatePaymentSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreatePaymentSchema,
  handler: async ({ userId, params, body }) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.invoiceId,
        OR: [
          { clientProfile: { workspace: { id: params.id, userId } } },
          { lease: { unit: { propertyProfile: { workspace: { id: params.id, userId } } } } },
          { tenant: { userId, leases: { some: { unit: { propertyProfile: { workspace: { id: params.id, userId } } } } } } },
          { applicant: { propertyProfile: { workspace: { id: params.id, userId } } } },
        ],
      },
      include: { lineItems: true, payments: true },
    })
    if (!invoice) return badRequest('Invoice not found')
    if (invoice.status === 'VOID') return badRequest('Cannot record payment on a voided invoice')

    const { total: invoiceTotal, paid: alreadyPaid } = computeInvoiceTotals(invoice)
    const remaining = invoiceTotal.minus(alreadyPaid)

    if (money(body.amount).gt(remaining.plus(money('0.001')))) {
      return badRequest(`Payment amount (${body.amount.toFixed(2)}) exceeds remaining balance (${remaining.toFixed(2)})`)
    }

    const txId = body.transactionId ?? null
    if (txId) {
      const linkedTx = await prisma.transaction.findFirst({
        where: { id: txId, workspace: { id: params.id } },
        include: { invoicePayment: true },
      })
      if (!linkedTx) return badRequest('Transaction not found on this project')
      if (linkedTx.invoicePayment) return badRequest('Transaction is already linked to another payment')
    }

    const payment = await prisma.$transaction(async tx => {
      const p = await tx.invoicePayment.create({
        data: {
          invoiceId: params.invoiceId,
          amount: body.amount,
          paidDate: new Date(body.paidDate),
          paymentMethod: body.paymentMethod,
          notes: body.notes,
          ...(txId ? { transactionId: txId } : {}),
        },
      })

      const newPaid = alreadyPaid.plus(body.amount)
      const newStatus = newPaid.gte(invoiceTotal.minus(money('0.001'))) ? 'PAID' : 'PARTIAL'
      await tx.invoice.update({
        where: { id: params.invoiceId },
        data: { status: newStatus },
      })

      if (txId) {
        await tx.invoicePaymentSuggestion.updateMany({
          where: { transactionId: txId, status: 'PENDING' },
          data: { status: 'DISMISSED' },
        })
      }

      return p
    })

    return ok(payment)
  },
})

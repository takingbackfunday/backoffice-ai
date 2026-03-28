import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreatePaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  paidDate: z.string().min(1, 'Paid date is required'),
  transactionId: z.string().optional().nullable(),
  paymentMethod: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

interface RouteParams { params: Promise<{ id: string; unitId: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { select: { units: { where: { id: unitId }, select: { id: true } } } } },
    })
    if (!project?.propertyProfile?.units[0]) return notFound('Unit not found')

    const lease = await prisma.lease.findFirst({
      where: { unitId, status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
      orderBy: { startDate: 'desc' },
    })
    if (!lease) return ok([], { count: 0 })

    const payments = await prisma.tenantPayment.findMany({
      where: { leaseId: lease.id },
      include: { transaction: { select: { id: true, description: true, date: true, amount: true } } },
      orderBy: { paidDate: 'desc' },
    })

    return ok(payments, { count: payments.length })
  } catch {
    return serverError('Failed to fetch payments')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { select: { units: { where: { id: unitId }, select: { id: true } } } } },
    })
    if (!project?.propertyProfile?.units[0]) return notFound('Unit not found')

    const body = await request.json()
    const parsed = CreatePaymentSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const { amount, paidDate, transactionId, paymentMethod, notes } = parsed.data

    const lease = await prisma.lease.findFirst({
      where: { unitId, status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
      orderBy: { startDate: 'desc' },
    })
    if (!lease) return badRequest('No active lease found for this unit')

    // If linking a transaction, verify it belongs to this user and isn't already linked
    if (transactionId) {
      const tx = await prisma.transaction.findFirst({
        where: { id: transactionId, account: { userId } },
        include: { tenantPayment: true },
      })
      if (!tx) return badRequest('Transaction not found')
      if (tx.tenantPayment) return badRequest('Transaction is already linked to a payment')
    }

    const payment = await prisma.tenantPayment.create({
      data: {
        leaseId: lease.id,
        tenantId: lease.tenantId,
        amount,
        paidDate: new Date(paidDate),
        transactionId: transactionId ?? null,
        paymentMethod: paymentMethod?.trim() ?? null,
        notes: notes?.trim() ?? null,
      },
      include: { transaction: { select: { id: true, description: true, date: true, amount: true } } },
    })

    // If this payment was created by accepting a suggestion, dismiss all other suggestions for this transaction
    if (transactionId) {
      await prisma.tenantPaymentSuggestion.updateMany({
        where: { transactionId, status: 'PENDING' },
        data: { status: 'DISMISSED' },
      })
    }

    return created(payment)
  } catch {
    return serverError('Failed to record payment')
  }
}

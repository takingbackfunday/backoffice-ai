import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

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
      include: { tenant: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { startDate: 'desc' },
    })
    if (!lease) return ok({ lease: null, charges: [], payments: [], balance: 0, totalCharged: 0, totalPaid: 0 })

    const [charges, payments, suggestions] = await Promise.all([
      prisma.tenantCharge.findMany({
        where: { leaseId: lease.id },
        include: { maintenanceRequest: { select: { id: true, title: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.tenantPayment.findMany({
        where: { leaseId: lease.id },
        include: { transaction: { select: { id: true, description: true, date: true, amount: true } } },
        orderBy: { paidDate: 'asc' },
      }),
      prisma.tenantPaymentSuggestion.findMany({
        where: { leaseId: lease.id, status: 'PENDING' },
        include: { transaction: { select: { id: true, description: true, date: true, amount: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Balance: only active (not forgiven) charges and non-voided payments count
    const activeCharges = charges.filter(c => !c.forgivenAt)
    const totalCharged = activeCharges.reduce((sum, c) => sum + Number(c.amount), 0)
    const totalPaid = payments.filter(p => !p.voidedAt).reduce((sum, p) => sum + Number(p.amount), 0)
    const balance = totalCharged - totalPaid  // positive = tenant owes, negative = overpaid

    return ok({
      lease: {
        id: lease.id,
        status: lease.status,
        startDate: lease.startDate.toISOString(),
        endDate: lease.endDate.toISOString(),
        monthlyRent: Number(lease.monthlyRent),
        paymentDueDay: lease.paymentDueDay,
        lateFeeAmount: lease.lateFeeAmount ? Number(lease.lateFeeAmount) : null,
        lateFeeGraceDays: lease.lateFeeGraceDays,
        tenant: lease.tenant,
      },
      charges: charges.map(c => ({
        id: c.id,
        type: c.type,
        description: c.description,
        amount: Number(c.amount),
        dueDate: c.dueDate.toISOString(),
        forgivenAt: c.forgivenAt?.toISOString() ?? null,
        forgivenReason: c.forgivenReason,
        maintenanceRequest: c.maintenanceRequest,
        createdAt: c.createdAt.toISOString(),
      })),
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        paidDate: p.paidDate.toISOString(),
        paymentMethod: p.paymentMethod,
        notes: p.notes,
        sourceDeleted: p.sourceDeleted,
        voidedAt: p.voidedAt?.toISOString() ?? null,
        voidReason: p.voidReason ?? null,
        transaction: p.transaction ? {
          id: p.transaction.id,
          description: p.transaction.description,
          date: p.transaction.date.toISOString(),
          amount: Number(p.transaction.amount),
        } : null,
        createdAt: p.createdAt.toISOString(),
      })),
      suggestions: suggestions.map(s => ({
        id: s.id,
        confidence: s.confidence,
        reasoning: s.reasoning,
        transaction: {
          id: s.transaction.id,
          description: s.transaction.description,
          date: s.transaction.date.toISOString(),
          amount: Number(s.transaction.amount),
        },
        createdAt: s.createdAt.toISOString(),
      })),
      totalCharged,
      totalPaid,
      balance,
    })
  } catch {
    return serverError('Failed to fetch ledger')
  }
}

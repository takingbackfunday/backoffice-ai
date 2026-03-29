import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { getPortalSession } from '@/lib/portal-auth'

export async function GET() {
  try {
    const session = await getPortalSession()
    if (!session) return unauthorized('Not a tenant account')

    const lease = await prisma.lease.findFirst({
      where: {
        tenantId: session.tenantId,
        status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] },
      },
      include: {
        unit: { select: { unitLabel: true } },
        tenantCharges: {
          orderBy: { dueDate: 'asc' },
          select: {
            id: true, type: true, description: true,
            amount: true, dueDate: true,
            forgivenAt: true, forgivenReason: true,
            createdAt: true,
          },
        },
        tenantPayments: {
          orderBy: { paidDate: 'desc' },
          select: {
            id: true, amount: true, paidDate: true,
            paymentMethod: true, notes: true, createdAt: true,
            voidedAt: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    })

    if (!lease) return ok({ lease: null, charges: [], payments: [], balance: 0, totalCharged: 0, totalPaid: 0 })

    const activeCharges = lease.tenantCharges.filter(c => !c.forgivenAt)
    const totalCharged = activeCharges.reduce((s, c) => s + Number(c.amount), 0)
    const totalPaid = lease.tenantPayments.filter(p => !p.voidedAt).reduce((s, p) => s + Number(p.amount), 0)
    const balance = totalCharged - totalPaid

    return ok({
      lease: {
        id: lease.id,
        status: lease.status,
        startDate: lease.startDate.toISOString(),
        endDate: lease.endDate.toISOString(),
        monthlyRent: Number(lease.monthlyRent),
        paymentDueDay: lease.paymentDueDay,
        unitLabel: lease.unit.unitLabel,
      },
      charges: lease.tenantCharges.map(c => ({
        id: c.id,
        type: c.type,
        description: c.description,
        amount: Number(c.amount),
        dueDate: c.dueDate.toISOString(),
        forgivenAt: c.forgivenAt?.toISOString() ?? null,
        forgivenReason: c.forgivenReason,
        createdAt: c.createdAt.toISOString(),
      })),
      payments: lease.tenantPayments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        paidDate: p.paidDate.toISOString(),
        paymentMethod: p.paymentMethod,
        notes: p.notes,
        createdAt: p.createdAt.toISOString(),
      })),
      totalCharged,
      totalPaid,
      balance,
    })
  } catch {
    return serverError('Failed to fetch payments')
  }
}

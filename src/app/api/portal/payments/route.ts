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
        invoices: {
          where: { status: { not: 'VOID' } },
          include: {
            lineItems: true,
            payments: true,
          },
          orderBy: { dueDate: 'desc' },
        },
      },
      orderBy: { startDate: 'desc' },
    })

    if (!lease) return ok({ lease: null, invoices: [], balance: 0, totalCharged: 0, totalPaid: 0 })

    let totalCharged = 0
    let totalPaid = 0

    const mappedInvoices = lease.invoices.map(inv => {
      const lineItemTotal = inv.lineItems
        .filter(li => !li.forgivenAt)
        .reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0)
      const paymentTotal = inv.payments
        .filter(p => !p.voidedAt)
        .reduce((s, p) => s + Number(p.amount), 0)

      totalCharged += lineItemTotal
      totalPaid += paymentTotal

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        period: inv.period,
        dueDate: inv.dueDate.toISOString(),
        lineItems: inv.lineItems.map(li => ({
          id: li.id,
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          chargeType: li.chargeType,
          forgivenAt: li.forgivenAt?.toISOString() ?? null,
        })),
        payments: inv.payments
          .filter(p => !p.voidedAt)
          .map(p => ({
            id: p.id,
            amount: Number(p.amount),
            paidDate: p.paidDate.toISOString(),
            paymentMethod: p.paymentMethod,
            notes: p.notes,
            createdAt: p.createdAt.toISOString(),
          })),
        lineItemTotal,
        paymentTotal,
        outstanding: lineItemTotal - paymentTotal,
      }
    })

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
      invoices: mappedInvoices,
      totalCharged,
      totalPaid,
      balance: totalCharged - totalPaid,
    })
  } catch {
    return serverError('Failed to fetch payments')
  }
}

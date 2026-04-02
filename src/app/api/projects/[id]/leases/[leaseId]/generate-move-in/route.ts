import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; leaseId: string }> }

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, leaseId } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: {
        propertyProfile: {
          include: { units: { select: { id: true } } },
        },
      },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, unitId: { in: unitIds } },
      include: {
        tenant: true,
        unit: {
          include: {
            propertyProfile: true,
          },
        },
      },
    })
    if (!lease) return notFound('Lease not found')
    if (!['DRAFT', 'ACTIVE'].includes(lease.status)) {
      return badRequest('Lease must be DRAFT or ACTIVE to generate move-in invoice')
    }

    const monthlyRent = Number(lease.monthlyRent)
    const startDate = lease.startDate
    const startDay = startDate.getDate()
    const daysInMonth = getDaysInMonth(startDate.getFullYear(), startDate.getMonth())

    const lineItems: Array<{ description: string; quantity: number; unitPrice: number; chargeType: string }> = []
    const charges: Array<{ type: string; description: string; amount: number }> = []

    // First month rent (or prorated)
    if (startDay === 1) {
      lineItems.push({
        description: `First month rent — ${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        quantity: 1,
        unitPrice: monthlyRent,
        chargeType: 'RENT',
      })
      charges.push({ type: 'RENT', description: 'First month rent', amount: monthlyRent })
    } else {
      // Prorated rent
      const daysRemaining = daysInMonth - startDay + 1
      const proratedRent = Math.round((monthlyRent * daysRemaining / daysInMonth) * 100) / 100
      lineItems.push({
        description: `Prorated rent (${daysRemaining} of ${daysInMonth} days) — ${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        quantity: 1,
        unitPrice: proratedRent,
        chargeType: 'RENT',
      })
      charges.push({ type: 'RENT', description: 'Prorated first month rent', amount: proratedRent })

      // First full month
      const nextMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1)
      lineItems.push({
        description: `Rent — ${nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        quantity: 1,
        unitPrice: monthlyRent,
        chargeType: 'RENT',
      })
      charges.push({ type: 'RENT', description: 'First full month rent', amount: monthlyRent })
    }

    // Security deposit
    if (lease.securityDeposit) {
      const depositAmount = Number(lease.securityDeposit)
      lineItems.push({
        description: 'Security deposit',
        quantity: 1,
        unitPrice: depositAmount,
        chargeType: 'DEPOSIT',
      })
      charges.push({ type: 'DEPOSIT', description: 'Security deposit', amount: depositAmount })
    }

    // Last month rent if required
    if (lease.unit.propertyProfile.requireLastMonth) {
      lineItems.push({
        description: 'Last month rent',
        quantity: 1,
        unitPrice: monthlyRent,
        chargeType: 'RENT',
      })
      charges.push({ type: 'RENT', description: 'Last month rent', amount: monthlyRent })
    }

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 3) // Due in 3 days

    const invoiceNumber = `MOVE-${Date.now().toString(36).toUpperCase()}`

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          leaseId: lease.id,
          tenantId: lease.tenantId,
          invoiceNumber,
          status: 'DRAFT',
          issueDate: new Date(),
          dueDate,
          currency: lease.currency ?? 'USD',
          notes: `Move-in charges for ${lease.unit.unitLabel}`,
          lineItems: {
            create: lineItems.map(li => ({
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              isTaxLine: false,
              chargeType: li.chargeType,
            })),
          },
        },
        include: { lineItems: true },
      })

      const createdCharges = await Promise.all(
        charges.map(c =>
          tx.tenantCharge.create({
            data: {
              leaseId: lease.id,
              tenantId: lease.tenantId,
              type: c.type as 'RENT' | 'DEPOSIT',
              description: c.description,
              amount: c.amount,
              dueDate,
            },
          })
        )
      )

      return { invoice, charges: createdCharges }
    })

    return ok(result)
  } catch {
    return serverError('Failed to generate move-in invoice')
  }
}

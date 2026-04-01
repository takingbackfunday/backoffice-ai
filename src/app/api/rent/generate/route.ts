import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const expectedToken = process.env.CRON_SECRET
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dayOfMonth = today.getDate()
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

    // Find active leases where today matches the payment due day
    const leases = await prisma.lease.findMany({
      where: {
        status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
        startDate: { lte: today },
        endDate: { gte: today },
        OR: [
          { paymentDueDay: dayOfMonth },
          // For leases with paymentDueDay > last day of month, trigger on last day
          ...(dayOfMonth === lastDayOfMonth
            ? [{ paymentDueDay: { gt: lastDayOfMonth } }]
            : []),
        ],
      },
      include: {
        tenant: true,
        unit: {
          include: {
            propertyProfile: {
              include: { project: true },
            },
          },
        },
      },
    })

    let generated = 0
    let skipped = 0
    let failed = 0

    for (const lease of leases) {
      try {
        // Dedup: check if a RENT charge already exists for this month
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

        const existingCharge = await prisma.tenantCharge.findFirst({
          where: {
            leaseId: lease.id,
            type: 'RENT',
            dueDate: { gte: monthStart, lte: monthEnd },
          },
        })

        if (existingCharge) {
          skipped++
          continue
        }

        const monthLabel = format(today, 'MMMM yyyy')

        await prisma.$transaction(async (tx) => {
          await tx.tenantCharge.create({
            data: {
              leaseId: lease.id,
              tenantId: lease.tenantId,
              type: 'RENT',
              description: `Rent — ${monthLabel}`,
              amount: lease.monthlyRent,
              dueDate: today,
            },
          })

          // Auto-generate invoice if property is configured to do so
          if (lease.unit.propertyProfile.autoGenerateRentInvoice) {
            const invoiceNumber = `RENT-${Date.now().toString(36).toUpperCase()}`
            await tx.invoice.create({
              data: {
                leaseId: lease.id,
                tenantId: lease.tenantId,
                invoiceNumber,
                status: 'SENT',
                issueDate: today,
                dueDate: today,
                currency: lease.currency ?? 'USD',
                notes: `Monthly rent — ${monthLabel}`,
                sentAt: today,
                sentTo: lease.tenant.email,
                lineItems: {
                  create: [{
                    description: `Rent — ${monthLabel}`,
                    quantity: 1,
                    unitPrice: lease.monthlyRent,
                    isTaxLine: false,
                    chargeType: 'RENT',
                  }],
                },
              },
            })
          }
        })

        generated++
      } catch (err) {
        console.error('[rent/generate] failed for lease', lease.id, err)
        failed++
      }
    }

    // Late fee assessment: check for overdue rent charges
    const overdueCutoff = new Date(today)
    const graceBuffer = 5 // max grace days to check

    const overdueCharges = await prisma.tenantCharge.findMany({
      where: {
        type: 'RENT',
        forgivenAt: null,
        dueDate: { lt: new Date(today.getTime() - graceBuffer * 86400000) },
      },
      include: {
        lease: { select: { id: true, lateFeeAmount: true, lateFeeGraceDays: true, tenantId: true } },
      },
    })

    for (const charge of overdueCharges) {
      if (!charge.lease.lateFeeAmount) continue

      const graceDays = charge.lease.lateFeeGraceDays ?? 5
      const cutoff = new Date(charge.dueDate.getTime() + graceDays * 86400000)
      if (today <= cutoff) continue

      // Check if late fee already assessed for this charge's due month
      const chargeMonthStart = new Date(charge.dueDate.getFullYear(), charge.dueDate.getMonth(), 1)
      const chargeMonthEnd = new Date(charge.dueDate.getFullYear(), charge.dueDate.getMonth() + 1, 0)

      const existingLateFee = await prisma.tenantCharge.findFirst({
        where: {
          leaseId: charge.leaseId,
          type: 'LATE_FEE',
          dueDate: { gte: chargeMonthStart, lte: chargeMonthEnd },
        },
      })

      if (!existingLateFee) {
        await prisma.tenantCharge.create({
          data: {
            leaseId: charge.leaseId,
            tenantId: charge.lease.tenantId,
            type: 'LATE_FEE',
            description: `Late fee — ${format(charge.dueDate, 'MMMM yyyy')}`,
            amount: charge.lease.lateFeeAmount,
            dueDate: overdueCutoff,
          },
        })
      }
    }

    return Response.json({ generated, skipped, failed })
  } catch (err) {
    console.error('[rent/generate] error:', err)
    return new Response('Internal error', { status: 500 })
  }
}

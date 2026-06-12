import { prisma } from '@/lib/prisma'
import { ok, badRequest, serverError } from '@/lib/api-response'
import { logger } from '@/lib/log'

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.INTERNAL_CRON_SECRET) {
    return badRequest('Invalid or missing cron secret')
  }

  try {
    const now = new Date()
    const nowStr = now.toISOString().slice(0, 10)

    // Find SENT invoices whose due date is strictly before today (date-only comparison)
    // Using date-only comparison per CLAUDE.md Neon timezone gotcha
    const sentInvoices = await prisma.invoice.findMany({
      where: { status: 'SENT' },
      select: { id: true, dueDate: true },
    })

    const overdueIds = sentInvoices
      .filter(inv => {
        const dueStr = inv.dueDate.toISOString().slice(0, 10)
        return dueStr < nowStr
      })
      .map(inv => inv.id)

    if (overdueIds.length === 0) {
      return ok({ updated: 0, message: 'No overdue invoices found' })
    }

    const result = await prisma.invoice.updateMany({
      where: { id: { in: overdueIds } },
      data: { status: 'OVERDUE' },
    })

    return ok({ updated: result.count, message: `Updated ${result.count} invoice(s) to OVERDUE` })
  } catch (err) {
    logger.error('sweep-overdue', 'error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to sweep overdue invoices')
  }
}

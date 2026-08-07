import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'
import { toDisplay } from '@/lib/money'
import { logger } from '@/lib/log'

interface RouteParams { params: Promise<{ id: string; jobId: string }> }

interface TimelineEvent {
  type: string
  date: string
  entityId: string
  entityNumber: string
  description: string
  metadata: Record<string, unknown>
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId } = await params

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        clientProfile: { workspace: { id, userId } },
      },
    })
    if (!job) return notFound('Job not found')

    const [quotes, invoices] = await Promise.all([
      prisma.quote.findMany({
        where: { jobId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invoice.findMany({
        where: { jobId },
        include: { payments: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const events: TimelineEvent[] = []

    for (const q of quotes) {
      events.push({
        type: 'quote_generated',
        date: q.createdAt.toISOString(),
        entityId: q.id,
        entityNumber: `${q.quoteNumber} v${q.version}`,
        description: `Quote ${q.quoteNumber} generated`,
        metadata: { version: q.version, total: q.totalQuoted ? toDisplay(q.totalQuoted) : null },
      })
      if (q.sentAt) {
        events.push({
          type: 'quote_sent',
          date: q.sentAt.toISOString(),
          entityId: q.id,
          entityNumber: `${q.quoteNumber} v${q.version}`,
          description: `Quote ${q.quoteNumber} sent to ${q.sentTo ?? 'client'}`,
          metadata: { sentTo: q.sentTo },
        })
      }
      if (q.status === 'ACCEPTED' && q.signedAt) {
        events.push({
          type: 'quote_accepted',
          date: q.signedAt.toISOString(),
          entityId: q.id,
          entityNumber: `${q.quoteNumber} v${q.version}`,
          description: `Quote ${q.quoteNumber} accepted`,
          metadata: {},
        })
      }
      if (q.status === 'REJECTED') {
        events.push({
          type: 'quote_rejected',
          date: q.updatedAt.toISOString(),
          entityId: q.id,
          entityNumber: `${q.quoteNumber} v${q.version}`,
          description: `Quote ${q.quoteNumber} rejected`,
          metadata: {},
        })
      }
    }

    for (const inv of invoices) {
      events.push({
        type: 'invoice_created',
        date: inv.createdAt.toISOString(),
        entityId: inv.id,
        entityNumber: inv.invoiceNumber,
        description: `Invoice ${inv.invoiceNumber} created`,
        metadata: { quoteId: inv.quoteId },
      })
      if (inv.sentAt) {
        events.push({
          type: 'invoice_sent',
          date: inv.sentAt.toISOString(),
          entityId: inv.id,
          entityNumber: inv.invoiceNumber,
          description: `Invoice ${inv.invoiceNumber} sent`,
          metadata: {},
        })
      }
      for (const payment of inv.payments) {
        events.push({
          type: 'payment_received',
          date: payment.createdAt.toISOString(),
          entityId: payment.id,
          entityNumber: inv.invoiceNumber,
        description: `Payment of ${toDisplay(payment.amount)} ${inv.currency} received for ${inv.invoiceNumber}`,
        metadata: { amount: toDisplay(payment.amount), invoiceId: inv.id },
        })
      }
    }

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return ok(events)
  } catch (e) {
    logger.error('timeline', 'GET error', { message: e instanceof Error ? e.message : String(e) })
    return serverError()
  }
}

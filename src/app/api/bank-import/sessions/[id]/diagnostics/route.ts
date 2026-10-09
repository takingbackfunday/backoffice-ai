import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { notFound, ok } from '@/lib/api-response'
import { requireBankImportSession } from '@/lib/bank-import/authz'
import { sanitizeTraceRecord } from '@/lib/bank-import/trace'
import { prisma } from '@/lib/prisma'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

const ParamsSchema = z.object({ id: z.string().min(1) })

export const GET = withBankImportFlag(authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const session = await requireBankImportSession(userId, params.id)
    const [row, events] = await Promise.all([
      prisma.bankImportSession.findUnique({
        where: { id: session.id },
        select: { status: true, createdAt: true, startedAt: true, capturedAt: true, finishedAt: true, errorCode: true },
      }),
      prisma.bankImportEvent.findMany({
        where: { sessionId: session.id, type: 'trace' },
        orderBy: { createdAt: 'asc' },
        take: 2000,
        select: { id: true, createdAt: true, data: true },
      }),
    ])
    const traces = events.flatMap((event) => {
      const trace = sanitizeTraceRecord(event.data)
      return trace ? [{ id: event.id, createdAt: event.createdAt.toISOString(), ...trace }] : []
    })
    return ok({
      sessionId: session.id,
      session: row ? {
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        startedAt: row.startedAt?.toISOString() ?? null,
        capturedAt: row.capturedAt?.toISOString() ?? null,
        finishedAt: row.finishedAt?.toISOString() ?? null,
        errorCode: row.errorCode,
      } : null,
      traces,
    })
  },
}))

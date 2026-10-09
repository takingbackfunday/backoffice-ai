import { authedRoute } from '@/lib/api-handler'
import { notFound, ok } from '@/lib/api-response'
import { ACTIVE_STATUSES } from '@/lib/bank-import/status'
import { SNAPSHOT_INCLUDE, toSnapshot } from '@/lib/bank-import/sessions'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'
import { prisma } from '@/lib/prisma'

const getActiveSession = withBankImportFlag(authedRoute({
  handler: async ({ userId }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const active = await prisma.bankImportSession.findFirst({
      where: { userId, status: { in: [...ACTIVE_STATUSES] } },
      include: SNAPSHOT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    if (active) return ok(toSnapshot(active))

    // A completed or discarded newer capture must suppress older review banners.
    const captured = await prisma.bankImportSession.findFirst({
      where: { userId, capturedAt: { not: null }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
      include: SNAPSHOT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    return ok(captured?.status === 'CAPTURED' ? toSnapshot(captured) : null)
  },
}))

export async function GET(...args: Parameters<typeof getActiveSession>) {
  const response = await getActiveSession(...args)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

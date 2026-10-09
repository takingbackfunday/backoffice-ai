import { authedRoute } from '@/lib/api-handler'
import { notFound, ok } from '@/lib/api-response'
import { ACTIVE_STATUSES } from '@/lib/bank-import/status'
import { SNAPSHOT_INCLUDE, toSnapshot } from '@/lib/bank-import/sessions'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'
import { prisma } from '@/lib/prisma'

export const GET = withBankImportFlag(authedRoute({
  handler: async ({ userId }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const active = await prisma.bankImportSession.findFirst({
      where: { userId, status: { in: [...ACTIVE_STATUSES] } },
      include: SNAPSHOT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    if (active) return ok(toSnapshot(active))

    const captured = await prisma.bankImportSession.findFirst({
      where: { userId, status: 'CAPTURED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
      include: SNAPSHOT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    return ok(captured ? toSnapshot(captured) : null)
  },
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, badRequest, notFound } from '@/lib/api-response'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return unauthorized()

  const url = new URL(request.url)
  const accountId = url.searchParams.get('accountId')

  if (!accountId) {
    return badRequest('accountId query parameter is required')
  }

  try {
    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId }
    })

    if (!account) {
      return notFound('Account not found or does not belong to you')
    }

    // Load playbook (omit steps JSON for performance)
    const playbook = await prisma.bankPlaybook.findUnique({
      where: { accountId },
      select: {
        id: true,
        loginUrl: true,
        twoFaType: true,
        status: true,
        lastVerifiedAt: true,
        createdAt: true,
        // Omit steps JSON
      }
    })

    // Load recent sync jobs
    const recentSyncs = await prisma.syncJob.findMany({
      where: { accountId },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        triggeredBy: true,
        startedAt: true,
        completedAt: true,
        error: true,
        imported: true,
        skipped: true,
      }
    })

    return ok({
      isConnected: !!playbook,
      playbook,
      recentSyncs,
    })

  } catch (err) {
    console.error('[bank-agent/status]', err)
    return badRequest('Failed to fetch bank agent status')
  }
}
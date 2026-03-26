import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/bank-agent/crypto'
import { getAdapter } from '@/lib/bank-providers'
import { importNormalizedTransactions } from '@/lib/bank-providers/sync-engine'
import { subDays } from 'date-fns'
import type { TellerWebhookPayload } from '@/types/bank-providers'

// NOTE: This route is public (excluded from Clerk middleware).

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as TellerWebhookPayload

    console.log('[webhook/teller] received:', payload.type, payload.id)

    if (payload.type === 'webhook.test') {
      return new Response('OK', { status: 200 })
    }

    if (payload.type === 'enrollment.disconnected') {
      const enrollmentId = payload.payload.enrollment_id
      if (!enrollmentId) return new Response('OK', { status: 200 })

      await prisma.bankConnection.updateMany({
        where: { tellerEnrollmentId: enrollmentId, provider: 'TELLER' },
        data: {
          status: 'DISCONNECTED',
          disconnectReason: payload.payload.reason || 'Unknown',
        },
      })

      console.log('[webhook/teller] enrollment disconnected:', enrollmentId, payload.payload.reason)
      return new Response('OK', { status: 200 })
    }

    if (payload.type === 'transactions.processed') {
      const enrollmentId = payload.payload.enrollment_id
      if (!enrollmentId) return new Response('OK', { status: 200 })

      const connections = await prisma.bankConnection.findMany({
        where: {
          tellerEnrollmentId: enrollmentId,
          provider: 'TELLER',
          status: 'ACTIVE',
        },
      })

      for (const conn of connections) {
        if (!conn.tokenCiphertext || !conn.tokenIv || !conn.tokenAuthTag) continue

        try {
          const accessToken = decrypt(conn.tokenCiphertext, conn.tokenIv, conn.tokenAuthTag, conn.userId)
          const adapter = getAdapter('TELLER')
          const externalAccountId = conn.tellerAccountId || ''

          const startDate = conn.lastSyncAt
            ? subDays(conn.lastSyncAt, 10).toISOString().split('T')[0]
            : subDays(new Date(), 30).toISOString().split('T')[0]

          const result = await adapter.fetchTransactions(accessToken, externalAccountId, {
            startDate,
            endDate: new Date().toISOString().split('T')[0],
          })

          const syncJob = await prisma.syncJob.create({
            data: {
              accountId: conn.accountId,
              provider: 'TELLER',
              bankConnectionId: conn.id,
              status: 'IMPORTING',
              triggeredBy: 'webhook',
            },
          })

          await importNormalizedTransactions({
            userId: conn.userId,
            accountId: conn.accountId,
            provider: 'TELLER',
            transactions: result.transactions,
            syncJobId: syncJob.id,
          })

          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: {
              lastSyncAt: new Date(),
              lastSyncCursor: result.cursor,
            },
          })
        } catch (err) {
          console.error('[webhook/teller] sync error for connection', conn.id, err)
          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { errorCount: { increment: 1 } },
          })
        }
      }

      return new Response('OK', { status: 200 })
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[webhook/teller] error:', err)
    return new Response('Internal error', { status: 500 })
  }
}

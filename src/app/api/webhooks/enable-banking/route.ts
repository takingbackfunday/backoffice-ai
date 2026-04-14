import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/bank-agent/crypto'
import { EnableBankingAdapter } from '@/lib/bank-providers/enable-banking'
import { importNormalizedTransactions } from '@/lib/bank-providers/sync-engine'
import { subDays } from 'date-fns'
import type { EnableBankingWebhookPayload } from '@/types/bank-providers'

// NOTE: Public route — excluded from Clerk middleware.

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as EnableBankingWebhookPayload

    console.log('[webhook/enable-banking] received:', payload.event_type, payload.session_id)

    if (payload.event_type === 'session.expired') {
      await prisma.bankConnection.updateMany({
        where: { enableBankingSessionId: payload.session_id, provider: 'ENABLE_BANKING' },
        data: { status: 'DISCONNECTED', disconnectReason: 'Consent session expired' },
      })
      console.log('[webhook/enable-banking] session expired:', payload.session_id)
      return new Response('OK', { status: 200 })
    }

    if (payload.event_type === 'session.revoked') {
      await prisma.bankConnection.updateMany({
        where: { enableBankingSessionId: payload.session_id, provider: 'ENABLE_BANKING' },
        data: { status: 'REVOKED', disconnectReason: 'Session revoked by user or bank' },
      })
      return new Response('OK', { status: 200 })
    }

    if (payload.event_type === 'transactions.available') {
      const connections = await prisma.bankConnection.findMany({
        where: {
          enableBankingSessionId: payload.session_id,
          provider: 'ENABLE_BANKING',
          status: 'ACTIVE',
        },
      })

      for (const conn of connections) {
        if (!conn.tokenCiphertext || !conn.tokenIv || !conn.tokenAuthTag) continue
        if (!conn.enableBankingAccountId) continue

        try {
          const accessToken = decrypt(conn.tokenCiphertext, conn.tokenIv, conn.tokenAuthTag, conn.userId)
          const adapter = new EnableBankingAdapter()

          const startDate = conn.lastSyncAt
            ? subDays(conn.lastSyncAt, 10).toISOString().split('T')[0]
            : subDays(new Date(), 30).toISOString().split('T')[0]

          const result = await adapter.fetchTransactions(accessToken, conn.enableBankingAccountId, {
            startDate,
            endDate: new Date().toISOString().split('T')[0],
          })

          const syncJob = await prisma.syncJob.create({
            data: {
              accountId: conn.accountId,
              provider: 'ENABLE_BANKING',
              bankConnectionId: conn.id,
              status: 'IMPORTING',
              triggeredBy: 'webhook',
            },
          })

          await importNormalizedTransactions({
            userId: conn.userId,
            accountId: conn.accountId,
            provider: 'ENABLE_BANKING',
            transactions: result.transactions,
            syncJobId: syncJob.id,
          })

          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { lastSyncAt: new Date() },
          })
        } catch (err) {
          console.error('[webhook/enable-banking] sync error for connection', conn.id, err)
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
    console.error('[webhook/enable-banking] error:', err)
    return new Response('Internal error', { status: 500 })
  }
}

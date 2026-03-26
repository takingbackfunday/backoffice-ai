import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/bank-agent/crypto'
import { getAdapter } from '@/lib/bank-providers'
import { importNormalizedTransactions } from '@/lib/bank-providers/sync-engine'
import type { PlaidWebhookPayload, NormalizedTransaction } from '@/types/bank-providers'

// NOTE: This route is public (excluded from Clerk middleware).

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as PlaidWebhookPayload

    console.log('[webhook/plaid] received:', payload.webhook_type, payload.webhook_code, payload.item_id)

    if (payload.webhook_type === 'ITEM' && payload.error) {
      const errorCode = payload.error.error_code
      const disconnectCodes = ['ITEM_LOGIN_REQUIRED', 'PENDING_EXPIRATION', 'ITEM_REVOKED']

      if (disconnectCodes.includes(errorCode)) {
        await prisma.bankConnection.updateMany({
          where: { plaidItemId: payload.item_id, provider: 'PLAID' },
          data: {
            status: errorCode === 'ITEM_REVOKED' ? 'REVOKED' : 'DISCONNECTED',
            disconnectReason: errorCode,
          },
        })
        console.log('[webhook/plaid] item disconnected:', payload.item_id, errorCode)
      }

      return new Response('OK', { status: 200 })
    }

    if (payload.webhook_type === 'TRANSACTIONS' && payload.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      const connections = await prisma.bankConnection.findMany({
        where: {
          plaidItemId: payload.item_id,
          provider: 'PLAID',
          status: 'ACTIVE',
        },
      })

      for (const conn of connections) {
        if (!conn.tokenCiphertext || !conn.tokenIv || !conn.tokenAuthTag) continue

        try {
          const accessToken = decrypt(conn.tokenCiphertext, conn.tokenIv, conn.tokenAuthTag, conn.userId)
          const adapter = getAdapter('PLAID')
          const externalAccountId = conn.plaidAccountId || ''

          let cursor = conn.lastSyncCursor || ''
          let allTransactions: NormalizedTransaction[] = []
          let hasMore = true

          while (hasMore) {
            const result = await adapter.fetchTransactions(accessToken, externalAccountId, {
              cursor,
              count: 500,
            })
            allTransactions = [...allTransactions, ...result.transactions]
            cursor = result.cursor || ''
            hasMore = result.hasMore
          }

          const syncJob = await prisma.syncJob.create({
            data: {
              accountId: conn.accountId,
              provider: 'PLAID',
              bankConnectionId: conn.id,
              status: 'IMPORTING',
              triggeredBy: 'webhook',
            },
          })

          await importNormalizedTransactions({
            userId: conn.userId,
            accountId: conn.accountId,
            provider: 'PLAID',
            transactions: allTransactions,
            syncJobId: syncJob.id,
          })

          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: {
              lastSyncAt: new Date(),
              lastSyncCursor: cursor,
            },
          })
        } catch (err) {
          console.error('[webhook/plaid] sync error for connection', conn.id, err)
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
    console.error('[webhook/plaid] error:', err)
    return new Response('Internal error', { status: 500 })
  }
}

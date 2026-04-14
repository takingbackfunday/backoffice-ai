import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/bank-agent/crypto'
import { getAdapter } from '@/lib/bank-providers'
import { importNormalizedTransactions } from '@/lib/bank-providers/sync-engine'
import { subDays, subHours } from 'date-fns'
import type { NormalizedTransaction } from '@/types/bank-providers'

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const expectedToken = process.env.CRON_SECRET
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const staleThreshold = subHours(new Date(), 6)
    const connections = await prisma.bankConnection.findMany({
      where: {
        status: 'ACTIVE',
        provider: { in: ['PLAID', 'ENABLE_BANKING'] },
        OR: [
          { lastSyncAt: null },
          { lastSyncAt: { lt: staleThreshold } },
        ],
      },
      take: 50,
    })

    console.log(`[sync/scheduled] found ${connections.length} stale connections`)

    let synced = 0
    let failed = 0

    for (const conn of connections) {
      if (!conn.tokenCiphertext || !conn.tokenIv || !conn.tokenAuthTag) continue

      try {
        const accessToken = decrypt(conn.tokenCiphertext, conn.tokenIv, conn.tokenAuthTag, conn.userId)
        const adapter = getAdapter(conn.provider)

        let allTransactions: NormalizedTransaction[] = []
        let newCursor: string | undefined

        if (conn.provider === 'PLAID') {
          let cursor = conn.lastSyncCursor || ''
          let hasMore = true
          while (hasMore) {
            const result = await adapter.fetchTransactions(
              accessToken,
              conn.plaidAccountId || '',
              { cursor, count: 500 }
            )
            allTransactions = [...allTransactions, ...result.transactions]
            cursor = result.cursor || ''
            hasMore = result.hasMore
            newCursor = cursor
          }
        } else {
          // Enable Banking: date-range
          const externalAccountId = conn.enableBankingAccountId || ''
          const startDate = conn.lastSyncAt
            ? subDays(conn.lastSyncAt, 10).toISOString().split('T')[0]
            : subDays(new Date(), 30).toISOString().split('T')[0]
          const result = await adapter.fetchTransactions(accessToken, externalAccountId, {
            startDate,
            endDate: new Date().toISOString().split('T')[0],
          })
          allTransactions = result.transactions
        }

        if (allTransactions.length > 0) {
          await importNormalizedTransactions({
            userId: conn.userId,
            accountId: conn.accountId,
            provider: conn.provider,
            transactions: allTransactions,
          })
        }

        await prisma.bankConnection.update({
          where: { id: conn.id },
          data: {
            lastSyncAt: new Date(),
            lastSyncCursor: newCursor || conn.lastSyncCursor,
            errorCount: 0,
          },
        })
        synced++
      } catch (err) {
        console.error('[sync/scheduled] failed for', conn.id, err)
        const errMsg = err instanceof Error ? err.message : ''

        if (errMsg === 'AUTH_FAILED') {
          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: {
              status: 'DISCONNECTED',
              disconnectReason: 'AUTH_FAILED during scheduled sync',
            },
          })
        } else {
          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { errorCount: { increment: 1 } },
          })
        }
        failed++
      }
    }

    return Response.json({ synced, failed, total: connections.length })
  } catch (err) {
    console.error('[sync/scheduled] error:', err)
    return new Response('Internal error', { status: 500 })
  }
}

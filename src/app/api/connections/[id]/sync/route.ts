import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { decrypt } from '@/lib/bank-agent/crypto'
import { getAdapter } from '@/lib/bank-providers'
import { importNormalizedTransactions } from '@/lib/bank-providers/sync-engine'
import { subDays } from 'date-fns'
import type { NormalizedTransaction } from '@/types/bank-providers'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params

    const connection = await prisma.bankConnection.findFirst({
      where: { id, userId },
    })
    if (!connection) return notFound('Connection not found')
    if (connection.status !== 'ACTIVE') {
      return badRequest(`Connection is ${connection.status.toLowerCase()}. Re-authenticate first.`)
    }
    if (!connection.tokenCiphertext || !connection.tokenIv || !connection.tokenAuthTag) {
      return badRequest('No access token stored for this connection')
    }
    if (connection.provider === 'BROWSER_AGENT') {
      return badRequest('Use /api/bank-agent/sync for browser agent connections')
    }

    const accessToken = decrypt(
      connection.tokenCiphertext,
      connection.tokenIv,
      connection.tokenAuthTag,
      userId
    )

    const syncJob = await prisma.syncJob.create({
      data: {
        accountId: connection.accountId,
        provider: connection.provider,
        bankConnectionId: connection.id,
        status: 'DOWNLOADING',
        triggeredBy: 'manual',
      },
    })

    const adapter = getAdapter(connection.provider)

    let allTransactions: NormalizedTransaction[] = []
    let newCursor: string | undefined

    if (connection.provider === 'PLAID') {
      // Plaid uses cursor-based incremental sync
      let cursor = connection.lastSyncCursor || ''
      let hasMore = true
      while (hasMore) {
        const result = await adapter.fetchTransactions(
          accessToken,
          connection.plaidAccountId || '',
          { cursor, count: 500 }
        )
        allTransactions = [...allTransactions, ...result.transactions]
        cursor = result.cursor || ''
        hasMore = result.hasMore
        newCursor = cursor
      }
    } else {
      // Enable Banking uses date-range sync
      const externalAccountId = connection.enableBankingAccountId || ''
      const startDate = connection.lastSyncAt
        ? subDays(connection.lastSyncAt, 10).toISOString().split('T')[0]
        : undefined
      const endDate = new Date().toISOString().split('T')[0]

      const result = await adapter.fetchTransactions(accessToken, externalAccountId, {
        startDate,
        endDate,
      })
      allTransactions = result.transactions
    }

    const syncResult = await importNormalizedTransactions({
      userId,
      accountId: connection.accountId,
      provider: connection.provider,
      transactions: allTransactions,
      syncJobId: syncJob.id,
    })

    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncCursor: newCursor || connection.lastSyncCursor,
        errorCount: 0,
      },
    })

    return ok({
      imported: syncResult.imported,
      skipped: syncResult.skipped,
      batchId: syncResult.batchId,
    })

  } catch (err) {
    console.error('[connections/sync]', err)
    return serverError('Sync failed')
  }
}

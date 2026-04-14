import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { encrypt } from '@/lib/bank-agent/crypto'
import { PlaidAdapter } from '@/lib/bank-providers'
import { importNormalizedTransactions } from '@/lib/bank-providers/sync-engine'
import type { NormalizedTransaction } from '@/types/bank-providers'

// Plaid uses a public-token exchange (browser → server).
// Enable Banking completes via its own OAuth callback route:
//   GET /api/connections/enable-banking/callback

const CreateConnectionSchema = z.object({
  accountId: z.string().min(1),
  provider: z.literal('PLAID'),
  plaidPublicToken: z.string().min(1),
  plaidAccountId: z.string().optional(),
  plaidInstitutionId: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreateConnectionSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    const data = parsed.data

    const account = await prisma.account.findFirst({
      where: { id: data.accountId, userId },
    })
    if (!account) return notFound('Account not found')

    const plaid = new PlaidAdapter()
    const exchange = await plaid.exchangePublicToken(data.plaidPublicToken)
    const accessToken = exchange.accessToken

    const enc = encrypt(accessToken, userId)

    const connection = await prisma.bankConnection.create({
      data: {
        accountId: data.accountId,
        userId,
        provider: 'PLAID',
        status: 'ACTIVE',
        tokenCiphertext: enc.ciphertext,
        tokenIv: enc.iv,
        tokenAuthTag: enc.authTag,
        plaidItemId: exchange.itemId,
        plaidAccountId: data.plaidAccountId,
        plaidInstitutionId: data.plaidInstitutionId,
      },
    })

    const syncJob = await prisma.syncJob.create({
      data: {
        accountId: data.accountId,
        provider: 'PLAID',
        bankConnectionId: connection.id,
        status: 'DOWNLOADING',
        triggeredBy: 'initial-connect',
      },
    })

    try {
      const externalAccountId = data.plaidAccountId ?? ''
      const result = await plaid.fetchTransactions(accessToken, externalAccountId, { count: 500 })

      let allTransactions: NormalizedTransaction[] = [...result.transactions]
      let cursor = result.cursor
      let hasMore = result.hasMore

      while (hasMore && cursor) {
        const page = await plaid.fetchTransactions(accessToken, externalAccountId, { cursor, count: 500 })
        allTransactions = [...allTransactions, ...page.transactions]
        cursor = page.cursor
        hasMore = page.hasMore
      }

      const syncResult = await importNormalizedTransactions({
        userId,
        accountId: data.accountId,
        provider: 'PLAID',
        transactions: allTransactions,
        syncJobId: syncJob.id,
      })

      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: new Date(), lastSyncCursor: cursor },
      })

      await prisma.institutionSchema.update({
        where: { id: account.institutionSchemaId },
        data: { preferredProvider: 'PLAID' },
      }).catch(() => {})

      return created({
        connectionId: connection.id,
        provider: 'PLAID',
        imported: syncResult.imported,
        skipped: syncResult.skipped,
      })

    } catch (syncErr) {
      console.error('[connections] initial Plaid sync failed:', syncErr)
      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'FAILED',
          error: syncErr instanceof Error ? syncErr.message : 'Initial sync failed',
          completedAt: new Date(),
        },
      })

      return created({
        connectionId: connection.id,
        provider: 'PLAID',
        imported: 0,
        skipped: 0,
        warning: 'Connection saved but initial sync failed. You can retry from the sync page.',
      })
    }

  } catch (err) {
    console.error('[connections]', err)
    return serverError('Failed to create connection')
  }
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const connections = await prisma.bankConnection.findMany({
      where: { userId },
      include: {
        account: { include: { institution: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(connections)
  } catch {
    return serverError('Failed to fetch connections')
  }
}

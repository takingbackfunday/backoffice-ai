import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { encrypt } from '@/lib/bank-agent/crypto'
import { getAdapter, PlaidAdapter } from '@/lib/bank-providers'
import { importNormalizedTransactions } from '@/lib/bank-providers/sync-engine'
import type { NormalizedTransaction } from '@/types/bank-providers'

const CreateConnectionSchema = z.object({
  accountId: z.string().min(1),
  provider: z.enum(['TELLER', 'PLAID']),

  // Teller fields
  tellerAccessToken: z.string().optional(),
  tellerEnrollmentId: z.string().optional(),
  tellerAccountId: z.string().optional(),
  tellerInstitutionId: z.string().optional(),

  // Plaid fields
  plaidPublicToken: z.string().optional(),
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

    let accessToken: string
    let connectionData: Record<string, unknown> = {}

    if (data.provider === 'TELLER') {
      if (!data.tellerAccessToken || !data.tellerEnrollmentId) {
        return badRequest('Teller access token and enrollment ID are required')
      }
      accessToken = data.tellerAccessToken
      connectionData = {
        tellerEnrollmentId: data.tellerEnrollmentId,
        tellerAccountId: data.tellerAccountId,
        tellerInstitutionId: data.tellerInstitutionId,
      }
    } else if (data.provider === 'PLAID') {
      if (!data.plaidPublicToken) {
        return badRequest('Plaid public token is required')
      }
      const plaid = new PlaidAdapter()
      const exchange = await plaid.exchangePublicToken(data.plaidPublicToken)
      accessToken = exchange.accessToken
      connectionData = {
        plaidItemId: exchange.itemId,
        plaidAccountId: data.plaidAccountId,
        plaidInstitutionId: data.plaidInstitutionId,
      }
    } else {
      return badRequest('Invalid provider')
    }

    const enc = encrypt(accessToken, userId)

    const connection = await prisma.bankConnection.create({
      data: {
        accountId: data.accountId,
        userId,
        provider: data.provider,
        status: 'ACTIVE',
        tokenCiphertext: enc.ciphertext,
        tokenIv: enc.iv,
        tokenAuthTag: enc.authTag,
        ...connectionData,
      },
    })

    const syncJob = await prisma.syncJob.create({
      data: {
        accountId: data.accountId,
        provider: data.provider,
        bankConnectionId: connection.id,
        status: 'DOWNLOADING',
        triggeredBy: 'initial-connect',
      },
    })

    try {
      const adapter = getAdapter(data.provider)
      const externalAccountId = data.provider === 'TELLER'
        ? data.tellerAccountId!
        : data.plaidAccountId!

      const result = await adapter.fetchTransactions(accessToken, externalAccountId, {
        count: 500,
      })

      let allTransactions: NormalizedTransaction[] = [...result.transactions]
      let cursor = result.cursor
      let hasMore = result.hasMore

      while (hasMore && cursor) {
        const page = await adapter.fetchTransactions(accessToken, externalAccountId, {
          cursor,
          count: 500,
        })
        allTransactions = [...allTransactions, ...page.transactions]
        cursor = page.cursor
        hasMore = page.hasMore
      }

      const syncResult = await importNormalizedTransactions({
        userId,
        accountId: data.accountId,
        provider: data.provider,
        transactions: allTransactions,
        syncJobId: syncJob.id,
      })

      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncCursor: cursor,
        },
      })

      await prisma.institutionSchema.update({
        where: { id: account.institutionSchemaId },
        data: { preferredProvider: data.provider },
      }).catch(() => {})

      return created({
        connectionId: connection.id,
        provider: data.provider,
        imported: syncResult.imported,
        skipped: syncResult.skipped,
      })

    } catch (syncErr) {
      console.error('[connections] initial sync failed:', syncErr)
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
        provider: data.provider,
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

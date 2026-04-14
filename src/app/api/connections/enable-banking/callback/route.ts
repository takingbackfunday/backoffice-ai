import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/bank-agent/crypto'
import { EnableBankingAdapter, exchangeEnableBankingCode } from '@/lib/bank-providers/enable-banking'
import { importNormalizedTransactions } from '@/lib/bank-providers/sync-engine'
import { badRequest, serverError } from '@/lib/api-response'
import { subDays } from 'date-fns'

// NOTE: Public route — excluded from Clerk middleware.
// Auth is established via the encrypted `state` param set in /api/connections/init.

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const stateParam = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://backoffice.cv'

    if (error) {
      const redirectUrl = new URL(`${appUrl}/connect/callback`)
      redirectUrl.searchParams.set('error', error)
      redirectUrl.searchParams.set('provider', 'enable-banking')
      return Response.redirect(redirectUrl.toString(), 302)
    }

    if (!code || !stateParam) {
      return badRequest('Missing code or state')
    }

    // Decode and verify state
    let accountId: string
    let userId: string
    try {
      const stateJson = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
      const decrypted = decrypt(stateJson.c, stateJson.i, stateJson.a, stateJson.c)
      const payload = JSON.parse(decrypted)
      accountId = payload.accountId
      userId = payload.userId
      const verified = JSON.parse(decrypt(stateJson.c, stateJson.i, stateJson.a, userId))
      if (verified.accountId !== accountId || verified.userId !== userId) {
        throw new Error('State mismatch')
      }
    } catch {
      return badRequest('Invalid state parameter')
    }

    const redirectUri = `${appUrl}/connect/callback`

    const tokens = await exchangeEnableBankingCode({ code, redirectUri })

    const enc = encrypt(tokens.accessToken, userId)
    let refreshEnc: { ciphertext: string; iv: string; authTag: string } | null = null
    if (tokens.refreshToken) {
      refreshEnc = encrypt(tokens.refreshToken, userId)
    }

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
      include: { institution: true },
    })
    if (!account) {
      const errorUrl = new URL(`${appUrl}/connect/callback`)
      errorUrl.searchParams.set('error', 'account_not_found')
      errorUrl.searchParams.set('provider', 'enable-banking')
      return Response.redirect(errorUrl.toString(), 302)
    }

    const adapter = new EnableBankingAdapter()
    const accounts = await adapter.fetchAccounts(tokens.accessToken)
    const externalAccount = accounts[0]
    if (!externalAccount) {
      const errorUrl = new URL(`${appUrl}/connect/callback`)
      errorUrl.searchParams.set('error', 'no_accounts')
      errorUrl.searchParams.set('provider', 'enable-banking')
      return Response.redirect(errorUrl.toString(), 302)
    }

    const connection = await prisma.bankConnection.create({
      data: {
        accountId,
        userId,
        provider: 'ENABLE_BANKING',
        status: 'ACTIVE',
        tokenCiphertext: enc.ciphertext,
        tokenIv: enc.iv,
        tokenAuthTag: enc.authTag,
        refreshCiphertext: refreshEnc?.ciphertext ?? null,
        refreshIv: refreshEnc?.iv ?? null,
        refreshAuthTag: refreshEnc?.authTag ?? null,
        tokenExpiresAt: tokens.expiresAt,
        enableBankingAccountId: externalAccount.externalId,
        enableBankingAspspId: account.institution.enableBankingAspspId,
      },
    })

    const syncJob = await prisma.syncJob.create({
      data: {
        accountId,
        provider: 'ENABLE_BANKING',
        bankConnectionId: connection.id,
        status: 'DOWNLOADING',
        triggeredBy: 'initial-connect',
      },
    })

    try {
      const startDate = subDays(new Date(), 90).toISOString().split('T')[0]
      const result = await adapter.fetchTransactions(tokens.accessToken, externalAccount.externalId, {
        startDate,
        endDate: new Date().toISOString().split('T')[0],
      })

      const syncResult = await importNormalizedTransactions({
        userId,
        accountId,
        provider: 'ENABLE_BANKING',
        transactions: result.transactions,
        syncJobId: syncJob.id,
      })

      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: new Date() },
      })

      await prisma.institutionSchema.update({
        where: { id: account.institutionSchemaId },
        data: { preferredProvider: 'ENABLE_BANKING' },
      }).catch(() => {})

      const successUrl = new URL(`${appUrl}/connect/callback`)
      successUrl.searchParams.set('provider', 'enable-banking')
      successUrl.searchParams.set('connectionId', connection.id)
      successUrl.searchParams.set('imported', String(syncResult.imported))
      successUrl.searchParams.set('skipped', String(syncResult.skipped))
      return Response.redirect(successUrl.toString(), 302)

    } catch (syncErr) {
      console.error('[connections/enable-banking/callback] initial sync failed:', syncErr)
      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'FAILED',
          error: syncErr instanceof Error ? syncErr.message : 'Initial sync failed',
          completedAt: new Date(),
        },
      })
      const warnUrl = new URL(`${appUrl}/connect/callback`)
      warnUrl.searchParams.set('provider', 'enable-banking')
      warnUrl.searchParams.set('connectionId', connection.id)
      warnUrl.searchParams.set('warning', 'sync_failed')
      return Response.redirect(warnUrl.toString(), 302)
    }

  } catch (err) {
    console.error('[connections/enable-banking/callback]', err)
    return serverError('Failed to complete Enable Banking connection')
  }
}

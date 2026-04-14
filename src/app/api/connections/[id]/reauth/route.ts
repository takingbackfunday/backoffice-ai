import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { decrypt, encrypt } from '@/lib/bank-agent/crypto'
import { PlaidAdapter } from '@/lib/bank-providers'
import { buildEnableBankingAuthUrl } from '@/lib/bank-providers/enable-banking'

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
      include: { account: { include: { institution: true } } },
    })
    if (!connection) return notFound('Connection not found')
    if (connection.status === 'ACTIVE') {
      return badRequest('Connection is already active')
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://backoffice.cv'
    const redirectUri = `${appUrl}/connect/callback`

    if (connection.provider === 'PLAID') {
      if (!connection.tokenCiphertext || !connection.tokenIv || !connection.tokenAuthTag) {
        return badRequest('No stored token for re-auth')
      }
      const accessToken = decrypt(
        connection.tokenCiphertext,
        connection.tokenIv,
        connection.tokenAuthTag,
        userId
      )
      const plaid = new PlaidAdapter()
      const linkToken = await plaid.createUpdateLinkToken(userId, accessToken)
      return ok({ mode: 'plaid_link', plaidLinkToken: linkToken })
    }

    if (connection.provider === 'ENABLE_BANKING') {
      const statePayload = JSON.stringify({ accountId: connection.accountId, userId })
      const { ciphertext, iv, authTag } = encrypt(statePayload, userId)
      const state = Buffer.from(JSON.stringify({ c: ciphertext, i: iv, a: authTag })).toString('base64url')
      const aspspId = connection.account.institution.enableBankingAspspId ?? ''
      const oauthUrl = buildEnableBankingAuthUrl({ aspspId, redirectUri, state })
      return ok({ mode: 'oauth_redirect', oauthUrl })
    }

    return badRequest('Browser agent connections cannot be re-authenticated via API')
  } catch (err) {
    console.error('[connections/reauth]', err)
    return serverError('Failed to generate re-auth token')
  }
}

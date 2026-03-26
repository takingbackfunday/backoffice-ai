import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { decrypt } from '@/lib/bank-agent/crypto'
import { PlaidAdapter } from '@/lib/bank-providers'

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
    if (connection.status === 'ACTIVE') {
      return badRequest('Connection is already active')
    }

    if (connection.provider === 'TELLER') {
      return ok({
        mode: 'teller_connect',
        tellerAppId: process.env.TELLER_APP_ID,
        tellerEnvironment: process.env.TELLER_ENVIRONMENT || 'sandbox',
        enrollmentId: connection.tellerEnrollmentId,
      })
    }

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
      return ok({
        mode: 'plaid_link',
        plaidLinkToken: linkToken,
      })
    }

    return badRequest('Browser agent connections cannot be re-authenticated via API')
  } catch (err) {
    console.error('[connections/reauth]', err)
    return serverError('Failed to generate re-auth token')
  }
}

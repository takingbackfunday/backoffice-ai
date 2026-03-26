import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { PlaidAdapter } from '@/lib/bank-providers'

const InitBodySchema = z.object({
  accountId: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = InitBodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    const { accountId } = parsed.data

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
      include: { institution: true, bankConnection: true },
    })
    if (!account) return notFound('Account not found')

    if (account.bankConnection) {
      return badRequest('Account already has an active bank connection')
    }

    const inst = account.institution

    // Teller only supports US banks. Route non-US institutions to Plaid.
    const isUS = inst.country === 'US'

    if (inst.preferredProvider === 'TELLER' || (!inst.preferredProvider && isUS && process.env.TELLER_APP_ID)) {
      return ok({
        provider: 'TELLER',
        tellerAppId: process.env.TELLER_APP_ID,
        tellerEnvironment: process.env.TELLER_ENVIRONMENT || 'sandbox',
      })
    }

    if (inst.preferredProvider === 'PLAID' || process.env.PLAID_CLIENT_ID) {
      const plaid = new PlaidAdapter()
      const webhookUrl = process.env.PLAID_WEBHOOK_URL || `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/plaid`
      const linkToken = await plaid.createLinkToken(userId, webhookUrl)

      return ok({
        provider: 'PLAID',
        plaidLinkToken: linkToken,
      })
    }

    return ok({
      provider: 'BROWSER_AGENT',
    })

  } catch (err) {
    console.error('[connections/init]', err)
    return serverError('Failed to initialize connection')
  }
}

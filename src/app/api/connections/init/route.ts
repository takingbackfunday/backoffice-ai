import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { PlaidAdapter } from '@/lib/bank-providers'
import { buildEnableBankingAuthUrl } from '@/lib/bank-providers/enable-banking'
import { encrypt } from '@/lib/bank-agent/crypto'

const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'NO', 'IS', 'LI',
])

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
    const country = inst.country?.toUpperCase() ?? 'US'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://backoffice.cv'
    const redirectUri = `${appUrl}/connect/callback`

    // Encode accountId in state so the callback can identify which account to connect.
    // The state is encrypted to prevent tampering.
    const statePayload = JSON.stringify({ accountId, userId })
    const { ciphertext, iv, authTag } = encrypt(statePayload, userId)
    const state = Buffer.from(JSON.stringify({ c: ciphertext, i: iv, a: authTag })).toString('base64url')

    // Explicit override wins; otherwise route by geography
    const preferred = inst.preferredProvider

    if (preferred === 'PLAID' || (!preferred && country === 'US' && process.env.PLAID_CLIENT_ID)) {
      const plaid = new PlaidAdapter()
      const webhookUrl = `${appUrl}/api/webhooks/plaid`
      const linkToken = await plaid.createLinkToken(userId, webhookUrl)
      return ok({ provider: 'PLAID', plaidLinkToken: linkToken })
    }

    if (
      preferred === 'ENABLE_BANKING' ||
      (!preferred && (EU_COUNTRIES.has(country) || country === 'GB') && process.env.ENABLE_BANKING_CLIENT_ID)
    ) {
      const aspspId = inst.enableBankingAspspId ?? ''
      const oauthUrl = buildEnableBankingAuthUrl({ aspspId, redirectUri, state })
      return ok({ provider: 'ENABLE_BANKING', oauthUrl })
    }

    // Fallback: browser automation
    return ok({ provider: 'BROWSER_AGENT' })

  } catch (err) {
    console.error('[connections/init]', err)
    return serverError('Failed to initialize connection')
  }
}

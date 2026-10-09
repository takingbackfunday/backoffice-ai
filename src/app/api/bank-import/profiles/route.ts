import { authedRoute } from '@/lib/api-handler'
import { badRequest, notFound, ok } from '@/lib/api-response'
import { deleteProfile, BrowserUseError } from '@/lib/bank-import/browser-use-client'
import { getBank } from '@/lib/bank-import/banks'
import { prisma } from '@/lib/prisma'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

export const DELETE = withBankImportFlag(authedRoute({
  handler: async ({ userId, request }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const bankKey = new URL(request.url).searchParams.get('bankKey')
    if (!bankKey || !getBank(bankKey)) return badRequest('A supported bankKey is required')
    const profiles = await prisma.bankBrowserProfile.findMany({ where: { userId, bankKey } })
    for (const profile of profiles) {
      try { await deleteProfile(profile.region as 'us' | 'eu', profile.profileId) } catch (error) {
        if (!(error instanceof BrowserUseError && error.status === 404)) throw error
      }
    }
    await prisma.bankBrowserProfile.deleteMany({ where: { userId, bankKey } })
    return ok({ forgotten: true })
  },
}))

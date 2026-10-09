import { authedRoute } from '@/lib/api-handler'
import { badRequest, notFound, ok } from '@/lib/api-response'
import { getBank } from '@/lib/bank-import/banks'
import { prisma } from '@/lib/prisma'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

export const DELETE = withBankImportFlag(authedRoute({
  handler: async ({ userId, request }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const bankKey = new URL(request.url).searchParams.get('bankKey')
    if (!bankKey || !getBank(bankKey)) return badRequest('A supported bankKey is required')
    await prisma.bankImportPlaybook.deleteMany({ where: { userId, bankKey } })
    return ok({ forgotten: true })
  },
}))

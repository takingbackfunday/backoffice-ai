import { authedRoute } from '@/lib/api-handler'
import { badRequest, notFound, ok } from '@/lib/api-response'
import { resolveBankKey, getBank } from '@/lib/bank-import/banks'
import { addDays, computeDefaultRange, isIsoDate } from '@/lib/bank-import/date-range'
import { getLastTxnDate } from '@/lib/bank-import/sessions'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'
import { prisma } from '@/lib/prisma'

export const GET = withBankImportFlag(authedRoute({
  handler: async ({ userId, request }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const url = new URL(request.url)
    const accountId = url.searchParams.get('accountId')
    const today = url.searchParams.get('today')
    if (!accountId || !today) return badRequest('accountId and today are required')
    if (!isIsoDate(today)) return badRequest('today must be a valid YYYY-MM-DD date')

    const serverToday = new Date().toISOString().slice(0, 10)
    if (today < addDays(serverToday, -1) || today > addDays(serverToday, 1)) {
      return badRequest('today must be within one day of the server date')
    }

    const account = await prisma.account.findFirst({ where: { id: accountId, userId }, include: { institution: true } })
    if (!account) return notFound('Account not found')
    const bankKey = resolveBankKey(account.institution.name)
    const bank = bankKey && getBank(bankKey)
    if (!bank) return badRequest("This bank isn't supported yet")
    const lastTxnDate = await getLastTxnDate(account.id)
    return ok({
      ...computeDefaultRange({ lastTxnDate, today, maxRangeDays: bank.maxRangeDays }),
      lastTxnDate,
      maxRangeDays: bank.maxRangeDays,
    })
  },
}))

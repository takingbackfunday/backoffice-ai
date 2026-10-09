import { authedRoute } from '@/lib/api-handler'
import { notFound, ok } from '@/lib/api-response'
import { resolveBankKey, getBank } from '@/lib/bank-import/banks'
import { getLastTxnDatesForUser } from '@/lib/bank-import/sessions'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'
import { prisma } from '@/lib/prisma'

export const GET = withBankImportFlag(authedRoute({
  handler: async ({ userId }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const [accounts, lastTxnDates] = await Promise.all([
      prisma.account.findMany({
        where: { userId },
        include: { institution: true },
        orderBy: { createdAt: 'asc' },
      }),
      getLastTxnDatesForUser(userId),
    ])

    const supported = accounts.flatMap((account) => {
      const bankKey = resolveBankKey(account.institution.name)
      const bank = bankKey && getBank(bankKey)
      if (!bankKey || !bank) return []
      return [{
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        institutionName: account.institution.name,
        bankKey,
        bankName: bank.displayName,
        askAccountHint: bank.askAccountHint,
        bankAccountHint: account.bankAccountHint,
        lastTxnDate: lastTxnDates.get(account.id) ?? null,
      }]
    })
    return ok(supported)
  },
}))

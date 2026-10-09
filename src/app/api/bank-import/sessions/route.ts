import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { badRequest, conflict, created, notFound } from '@/lib/api-response'
import { resolveBankKey, getBank } from '@/lib/bank-import/banks'
import { addDays, isIsoDate, validateRange } from '@/lib/bank-import/date-range'
import { ACTIVE_STATUSES } from '@/lib/bank-import/status'
import { appendEvent, appendTrace, SESSION_TTL_MS } from '@/lib/bank-import/sessions'
import { wakeWorker } from '@/lib/bank-import/wake-worker'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'
import { prisma } from '@/lib/prisma'
import { checkDailyBudget } from '@/lib/agent/usage'
import { NextResponse } from 'next/server'

const CreateSessionSchema = z.object({
  accountId: z.string().min(1),
  dateFrom: z.string(),
  dateTo: z.string(),
  today: z.string(),
  rememberBrowser: z.boolean(),
  accountHint: z.string().max(40).trim().optional().transform((value) => value || undefined),
})

export const POST = withBankImportFlag(authedRoute<void, z.infer<typeof CreateSessionSchema>>({
  bodySchema: CreateSessionSchema,
  handler: async ({ userId, body }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const account = await prisma.account.findFirst({ where: { id: body.accountId, userId }, include: { institution: true } })
    if (!account) return notFound('Account not found')
    const bankKey = resolveBankKey(account.institution.name)
    const bank = bankKey && getBank(bankKey)
    if (!bankKey || !bank) return badRequest("This bank isn't supported yet")

    if (!isIsoDate(body.today)) return badRequest('today must be a valid YYYY-MM-DD date')
    const serverToday = new Date().toISOString().slice(0, 10)
    if (body.today < addDays(serverToday, -1) || body.today > addDays(serverToday, 1)) {
      return badRequest('today must be within one day of the server date')
    }
    const rangeError = validateRange(body.dateFrom, body.dateTo, body.today, bank.maxRangeDays)
    if (rangeError) return badRequest(rangeError)

    const active = await prisma.bankImportSession.findFirst({
      where: { userId, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (active) return conflict('You already have an import in progress', { data: { id: active.id } })

    const budget = await checkDailyBudget(userId)
    if (!budget.ok) return NextResponse.json({ data: null, error: "You've reached today's AI usage limit. Try again tomorrow or upload a file manually." }, { status: 429 })
    if (body.accountHint) {
      await prisma.account.update({ where: { id: account.id }, data: { bankAccountHint: body.accountHint } })
    }

    const session = await prisma.bankImportSession.create({
      data: {
        userId,
        accountId: account.id,
        bankKey,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        rememberBrowser: body.rememberBrowser,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
      select: { id: true, status: true },
    })
    await appendEvent(session.id, 'status', 'Queued', { status: session.status })
    await appendTrace(session.id, 'session.created', 'event', { sessionStatus: session.status, outcome: 'ok' })
    wakeWorker(session.id)
    return created({ id: session.id })
  },
}))

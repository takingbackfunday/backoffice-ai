import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { loadUserRules, buildCondition } from '@/lib/rules/user-rules'
import type { TransactionFact } from '@/lib/rules/categorization'

const ConditionDefSchema = z.object({
  field: z.enum(['description', 'merchantName', 'payeeName', 'rawDescription', 'amount', 'currency']),
  operator: z.enum(['contains', 'equals', 'starts_with', 'regex', 'gt', 'lt', 'gte', 'lte', 'in', 'oneOf', 'between']),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.tuple([z.number(), z.number()])]),
})

const PreviewBodySchema = z.object({
  conditions: z.object({
    op: z.enum(['and', 'or']).default('and'),
    defs: z.array(ConditionDefSchema).min(1),
  }),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = PreviewBodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { conditions } = parsed.data
    const group = conditions.op === 'or'
      ? { any: conditions.defs }
      : { all: conditions.defs }

    const testCondition = buildCondition(group)

    // Fetch last 500 transactions for this user to test against
    const transactions = await prisma.transaction.findMany({
      where: { account: { userId } },
      orderBy: { date: 'desc' },
      take: 500,
      include: { account: true, payee: true, project: true },
    })

    const matches = transactions.filter((tx) => {
      const fact: TransactionFact = {
        description: tx.description,
        merchantName: tx.merchantName ?? null,
        payeeName: tx.payee?.name ?? null,
        amount: Number(tx.amount),
        currency: tx.account.currency,
        date: tx.date,
        rawDescription: tx.description,
      }
      return testCondition(fact)
    }).slice(0, 10)

    return ok(
      matches.map((tx) => ({
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: Number(tx.amount),
        currency: tx.account.currency,
        category: tx.category,
        payeeName: tx.payee?.name ?? null,
        projectName: tx.project?.name ?? null,
      })),
      { matchCount: matches.length }
    )
  } catch (err) {
    console.error('[/api/rules/preview]', err)
    return serverError('Failed to preview rule')
  }
}

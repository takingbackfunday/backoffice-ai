import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { loadUserRules, buildCondition } from '@/lib/rules/user-rules'
import type { TransactionFact } from '@/lib/rules/categorization'

const ConditionDefSchema = z.object({
  field: z.enum(['description', 'payeeName', 'rawDescription', 'amount', 'currency', 'accountName', 'notes', 'date', 'month', 'dayOfWeek']),
  operator: z.enum(['contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with', 'regex', 'gt', 'lt', 'gte', 'lte', 'in', 'oneOf', 'between']),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.tuple([z.number(), z.number()])]),
})

const PreviewBodySchema = z.object({
  conditions: z.object({
    op: z.enum(['and', 'or']).default('and'),
    defs: z.array(ConditionDefSchema).min(1),
  }),
})

const PREVIEW_LIMIT = 10

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === '1'

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

    // Fetch all transactions for this user to test against
    const transactions = await prisma.transaction.findMany({
      where: { account: { userId } },
      orderBy: { date: 'desc' },
      include: { account: true, payee: true, project: true },
    })

    const allMatches = transactions.filter((tx) => {
      const fact: TransactionFact = {
        description: tx.description,
        payeeName: tx.payee?.name ?? null,
        amount: Number(tx.amount),
        currency: tx.account.currency,
        date: tx.date,
        rawDescription: tx.description,
        accountName: tx.account.name,
        notes: tx.notes,
        tags: tx.tags,
      }
      return testCondition(fact)
    })

    const matchCount = allMatches.length
    const matches = all ? allMatches : allMatches.slice(0, PREVIEW_LIMIT)

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
      { matchCount }
    )
  } catch (err) {
    console.error('[/api/rules/preview]', err)
    return serverError('Failed to preview rule')
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, serverError } from '@/lib/api-response'

const CreateAccountSchema = z.object({
  institutionSchemaId: z.string().min(1),
  name: z.string().min(1, 'Account name is required'),
  type: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'CHECKING', 'SAVINGS', 'BUSINESS_CHECKING', 'TRUST_ACCOUNT']),
  currency: z.string().length(3).default('USD'),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const accounts = await prisma.account.findMany({
      where: { userId },
      include: { institution: true },
      orderBy: { createdAt: 'desc' },
    })

    return ok(accounts, { count: accounts.length })
  } catch {
    return serverError('Failed to fetch accounts')
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreateAccountSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const account = await prisma.account.create({
      data: { ...parsed.data, userId },
      include: { institution: true },
    })

    return created(account)
  } catch {
    return serverError('Failed to create account')
  }
}

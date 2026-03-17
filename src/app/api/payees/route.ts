import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, serverError } from '@/lib/api-response'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const payees = await prisma.payee.findMany({
      where: { userId },
      include: {
        defaultCategory: { include: { group: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { name: 'asc' },
    })

    return ok(payees)
  } catch (err) {
    console.error('[/api/payees GET]', err)
    return serverError('Failed to fetch payees')
  }
}

const CreatePayeeSchema = z.object({
  name: z.string().min(1),
  defaultCategoryId: z.string().nullable().optional(),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreatePayeeSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map((e) => e.message).join(', '))

    // Verify defaultCategoryId belongs to this user
    if (parsed.data.defaultCategoryId) {
      const cat = await prisma.category.findFirst({ where: { id: parsed.data.defaultCategoryId, userId } })
      if (!cat) return badRequest('Category not found or does not belong to you')
    }

    const payee = await prisma.payee.create({
      data: {
        userId,
        name: parsed.data.name,
        defaultCategoryId: parsed.data.defaultCategoryId ?? null,
      },
      include: { defaultCategory: { include: { group: true } } },
    })

    return created(payee)
  } catch (err) {
    console.error('[/api/payees POST]', err)
    return serverError('Failed to create payee')
  }
}

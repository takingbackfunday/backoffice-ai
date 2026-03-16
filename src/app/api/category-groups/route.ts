import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { seedDefaultCategories } from '@/lib/seed-categories'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    let groups = await prisma.categoryGroup.findMany({
      where: { userId },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { transactions: true } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })

    // Seed defaults on first visit
    if (groups.length === 0) {
      await seedDefaultCategories(userId, prisma)
      groups = await prisma.categoryGroup.findMany({
        where: { userId },
        include: {
          categories: {
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { transactions: true } } },
          },
        },
        orderBy: { sortOrder: 'asc' },
      })
    }

    return ok(groups)
  } catch (err) {
    console.error('[/api/category-groups GET]', err)
    return serverError('Failed to fetch category groups')
  }
}

const CreateGroupSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreateGroupSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map((e) => e.message).join(', '))

    const group = await prisma.categoryGroup.create({
      data: { ...parsed.data, userId },
      include: { categories: true },
    })

    return created(group)
  } catch (err) {
    console.error('[/api/category-groups POST]', err)
    return serverError('Failed to create category group')
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest, unauthorized, serverError } from '@/lib/api-response'

const CreateCategorySchema = z.object({
  name: z.string().min(1),
  groupId: z.string().min(1),
  sortOrder: z.number().int().optional(),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreateCategorySchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map((e) => e.message).join(', '))

    // Verify group belongs to user
    const group = await prisma.categoryGroup.findFirst({
      where: { id: parsed.data.groupId, userId },
    })
    if (!group) return badRequest('Category group not found or does not belong to you')

    const category = await prisma.category.create({
      data: { ...parsed.data, userId },
    })

    return created(category)
  } catch (err) {
    console.error('[/api/categories POST]', err)
    return serverError('Failed to create category')
  }
}

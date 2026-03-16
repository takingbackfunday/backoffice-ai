import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  groupId: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params
    const existing = await prisma.category.findFirst({ where: { id, userId } })
    if (!existing) return notFound('Category not found')

    const body = await request.json()
    const parsed = UpdateCategorySchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map((e) => e.message).join(', '))

    // Verify new groupId belongs to user if provided
    if (parsed.data.groupId) {
      const group = await prisma.categoryGroup.findFirst({
        where: { id: parsed.data.groupId, userId },
      })
      if (!group) return badRequest('Target group not found or does not belong to you')
    }

    const category = await prisma.category.update({
      where: { id },
      data: parsed.data,
    })

    return ok(category)
  } catch (err) {
    console.error('[/api/categories/[id] PATCH]', err)
    return serverError('Failed to update category')
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params
    const existing = await prisma.category.findFirst({
      where: { id, userId },
      include: { _count: { select: { transactions: true } } },
    })
    if (!existing) return notFound('Category not found')

    if (existing._count.transactions > 0) {
      return badRequest('Cannot delete category: it has transactions')
    }

    await prisma.category.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[/api/categories/[id] DELETE]', err)
    return serverError('Failed to delete category')
  }
}

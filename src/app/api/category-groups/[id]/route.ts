import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateGroupSchema = z.object({
  name: z.string().min(1).optional(),
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
    const existing = await prisma.categoryGroup.findFirst({ where: { id, userId } })
    if (!existing) return notFound('Category group not found')

    const body = await request.json()
    const parsed = UpdateGroupSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map((e) => e.message).join(', '))

    const group = await prisma.categoryGroup.update({
      where: { id },
      data: parsed.data,
      include: { categories: { orderBy: { sortOrder: 'asc' } } },
    })

    return ok(group)
  } catch (err) {
    console.error('[/api/category-groups/[id] PATCH]', err)
    return serverError('Failed to update category group')
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
    const existing = await prisma.categoryGroup.findFirst({
      where: { id, userId },
      include: { categories: { include: { _count: { select: { transactions: true } } } } },
    })
    if (!existing) return notFound('Category group not found')

    // Refuse if any category has transactions
    const hasTransactions = existing.categories.some((c) => c._count.transactions > 0)
    if (hasTransactions) {
      return badRequest('Cannot delete group: one or more categories have transactions')
    }

    await prisma.categoryGroup.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[/api/category-groups/[id] DELETE]', err)
    return serverError('Failed to delete category group')
  }
}

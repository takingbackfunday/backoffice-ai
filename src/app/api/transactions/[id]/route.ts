import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateTransactionSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().optional(),
  category: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params
    const existing = await prisma.transaction.findFirst({
      where: { id, account: { userId } },
    })
    if (!existing) return notFound('Transaction not found')

    const body = await request.json()
    const parsed = UpdateTransactionSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    // Verify foreign IDs belong to this user
    if (parsed.data.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: parsed.data.categoryId, userId } })
      if (!cat) return badRequest('Category not found or does not belong to you')
    }
    if (parsed.data.payeeId) {
      const payee = await prisma.payee.findFirst({ where: { id: parsed.data.payeeId, userId } })
      if (!payee) return badRequest('Payee not found or does not belong to you')
    }
    if (parsed.data.projectId) {
      const project = await prisma.project.findFirst({ where: { id: parsed.data.projectId, userId } })
      if (!project) return badRequest('Project not found or does not belong to you')
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: parsed.data,
      include: {
        account: true,
        project: true,
        categoryRef: { include: { group: true } },
        payee: true,
      },
    })

    return ok(updated)
  } catch {
    return serverError('Failed to update transaction')
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
    const existing = await prisma.transaction.findFirst({
      where: { id, account: { userId } },
    })
    if (!existing) return notFound('Transaction not found')

    await prisma.transaction.delete({ where: { id } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete transaction')
  }
}

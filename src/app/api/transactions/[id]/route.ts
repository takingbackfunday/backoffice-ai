import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { matchTenantPayments } from '@/lib/rent-matching'

const UpdateTransactionSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().optional(),
  date: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
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

    // If a project was just assigned, run matching fire-and-forget
    if (parsed.data.projectId && parsed.data.projectId !== existing.projectId) {
      matchTenantPayments(userId, [id]).catch(() => {})
    }

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

    await prisma.$transaction([
      // Flag any attributed tenant payment — keep the record but mark source as deleted
      prisma.tenantPayment.updateMany({
        where: { transactionId: id },
        data: { transactionId: null, sourceDeleted: true },
      }),
      // Delete any pending/accepted payment suggestions referencing this transaction
      prisma.tenantPaymentSuggestion.deleteMany({
        where: { transactionId: id },
      }),
      prisma.transaction.delete({ where: { id } }),
    ])
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete transaction')
  }
}

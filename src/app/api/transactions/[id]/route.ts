import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { matchInvoicePayments } from '@/lib/invoice-matching'

const ParamsSchema = z.object({ id: z.string() })

const UpdateTransactionSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().optional(),
  date: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
  category: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

export const PATCH = authedRoute<{ id: string }, z.infer<typeof UpdateTransactionSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: UpdateTransactionSchema,
  handler: async ({ userId, params, body }) => {
    const existing = await prisma.transaction.findFirst({
      where: { id: params.id, account: { userId } },
    })
    if (!existing) return badRequest('Transaction not found')

    if (body.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: body.categoryId, userId } })
      if (!cat) return badRequest('Category not found or does not belong to you')
    }
    if (body.payeeId) {
      const payee = await prisma.payee.findFirst({ where: { id: body.payeeId, userId } })
      if (!payee) return badRequest('Payee not found or does not belong to you')
    }
    if (body.workspaceId) {
      const project = await prisma.workspace.findFirst({ where: { id: body.workspaceId, userId } })
      if (!project) return badRequest('Project not found or does not belong to you')
    }

    const updated = await prisma.transaction.update({
      where: { id: params.id },
      data: body,
      include: {
        account: true,
        workspace: true,
        categoryRef: { include: { group: true } },
        payee: true,
      },
    })

    if (body.workspaceId && body.workspaceId !== existing.workspaceId) {
      matchInvoicePayments(userId, [params.id]).catch(() => {})
    }

    return ok(updated)
  },
})

export const DELETE = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const existing = await prisma.transaction.findFirst({
      where: { id: params.id, account: { userId } },
    })
    if (!existing) return badRequest('Transaction not found')

    await prisma.$transaction([
      prisma.invoicePayment.updateMany({
        where: { transactionId: params.id },
        data: { transactionId: null, sourceDeleted: true },
      }),
      prisma.invoicePaymentSuggestion.deleteMany({ where: { transactionId: params.id } }),
      prisma.transaction.delete({ where: { id: params.id } }),
    ])
    return ok({ deleted: true })
  },
})

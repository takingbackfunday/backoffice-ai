import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const ConditionDefSchema = z.object({
  field: z.enum(['description', 'merchantName', 'payeeName', 'rawDescription', 'amount', 'currency']),
  operator: z.enum(['contains', 'equals', 'starts_with', 'regex', 'gt', 'lt', 'gte', 'lte', 'in', 'oneOf', 'between']),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.tuple([z.number(), z.number()])]),
})

const ConditionGroupSchema = z.object({
  all: z.array(ConditionDefSchema).optional(),
  any: z.array(ConditionDefSchema).optional(),
}).refine((g) => (g.all ?? g.any ?? []).length > 0, { message: 'conditions must have at least one rule' })

const UpdateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  priority: z.number().int().min(1).max(99).optional(),
  conditions: ConditionGroupSchema.optional(),
  categoryName: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  payeeName: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params
    const existing = await prisma.categorizationRule.findFirst({ where: { id, userId } })
    if (!existing) return notFound('Rule not found')

    const body = await request.json()
    const parsed = UpdateRuleSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map((e) => e.message).join(', '))

    const { payeeName, ...rest } = parsed.data

    // Upsert payee by name if provided
    let payeeId: string | null | undefined = undefined
    if (payeeName !== undefined) {
      if (payeeName) {
        const payee = await prisma.payee.upsert({
          where: { userId_name: { userId, name: payeeName } },
          update: {},
          create: { userId, name: payeeName },
        })
        payeeId = payee.id
      } else {
        payeeId = null
      }
    }

    const rule = await prisma.categorizationRule.update({
      where: { id },
      data: { ...rest, ...(payeeId !== undefined ? { payeeId } : {}) },
      include: {
        project: { select: { id: true, name: true } },
        categoryRef: { include: { group: true } },
        payee: true,
      },
    })
    return ok(rule)
  } catch {
    return serverError('Failed to update rule')
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
    const existing = await prisma.categorizationRule.findFirst({ where: { id, userId } })
    if (!existing) return notFound('Rule not found')

    await prisma.categorizationRule.delete({ where: { id } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete rule')
  }
}

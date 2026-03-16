import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdatePayeeSchema = z.object({
  name: z.string().min(1).optional(),
  defaultCategoryId: z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params
    const existing = await prisma.payee.findFirst({ where: { id, userId } })
    if (!existing) return notFound('Payee not found')

    const body = await request.json()
    const parsed = UpdatePayeeSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map((e) => e.message).join(', '))

    const payee = await prisma.payee.update({
      where: { id },
      data: parsed.data,
      include: { defaultCategory: { include: { group: true } } },
    })

    return ok(payee)
  } catch (err) {
    console.error('[/api/payees/[id] PATCH]', err)
    return serverError('Failed to update payee')
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
    const existing = await prisma.payee.findFirst({ where: { id, userId } })
    if (!existing) return notFound('Payee not found')

    // Nullify payeeId on related transactions (scoped to this user's accounts)
    await prisma.transaction.updateMany({
      where: { payeeId: id, account: { userId } },
      data: { payeeId: null },
    })

    await prisma.payee.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[/api/payees/[id] DELETE]', err)
    return serverError('Failed to delete payee')
  }
}

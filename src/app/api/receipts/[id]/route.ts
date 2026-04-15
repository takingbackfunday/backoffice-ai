import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams {
  params: Promise<{ id: string }>
}

const PatchSchema = z
  .object({
    transactionId: z.string().nullable().optional(),
    workspaceId: z.string().nullable().optional(),
    extractedData: z.record(z.unknown()).optional(),
    confirmed: z.boolean().optional(),
  })
  .strict()

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId },
    })
    if (!receipt) return notFound('Receipt not found')

    const body = await request.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success)
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))

    const { transactionId, workspaceId, extractedData, confirmed } = parsed.data

    // Validate transaction ownership if linking
    if (transactionId) {
      const txn = await prisma.transaction.findFirst({
        where: { id: transactionId, account: { userId } },
        select: { id: true },
      })
      if (!txn) return badRequest('Transaction not found or does not belong to you')
    }

    // Validate workspace ownership if linking
    if (workspaceId) {
      const ws = await prisma.workspace.findFirst({
        where: { id: workspaceId, userId },
        select: { id: true },
      })
      if (!ws) return badRequest('Workspace not found or does not belong to you')
    }

    const updated = await prisma.receipt.update({
      where: { id },
      data: {
        ...(transactionId !== undefined ? { transactionId } : {}),
        ...(workspaceId !== undefined ? { workspaceId } : {}),
        ...(extractedData !== undefined ? { extractedData: extractedData as Prisma.InputJsonValue } : {}),
        ...(confirmed ? { status: 'READY' } : {}),
      },
      include: {
        workspace: { select: { id: true, name: true } },
        transaction: { select: { id: true, date: true, amount: true, description: true, category: true } },
      },
    })

    return ok(updated)
  } catch (err) {
    console.error('[/api/receipts/[id] PATCH]', err)
    return serverError()
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId },
    })
    if (!receipt) return notFound('Receipt not found')

    await prisma.receipt.delete({ where: { id } })

    return ok({ deleted: true })
  } catch (err) {
    console.error('[/api/receipts/[id] DELETE]', err)
    return serverError()
  }
}

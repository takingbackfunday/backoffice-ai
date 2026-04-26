import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateBillSchema = z.object({
  status: z.enum(['RECEIVED', 'APPROVED', 'PAID', 'VOID']).optional(),
  transactionId: z.string().nullable().optional(),
  paidDate: z.string().nullable().optional(),
  notes: z.string().optional(),
  billNumber: z.string().optional(),
  dueDate: z.string().nullable().optional(),
})

interface RouteParams { params: Promise<{ id: string; woId: string; billId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, woId, billId } = await params
    const workOrder = await prisma.workOrder.findFirst({ where: { id: woId, workspaceId: id, userId } })
    if (!workOrder) return notFound('Work order not found')
    const bill = await prisma.bill.findFirst({ where: { id: billId, workOrderId: woId } })
    if (!bill) return notFound('Bill not found')
    const body = await request.json()
    const parsed = UpdateBillSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    // Validate transactionId uniqueness
    if (parsed.data.transactionId) {
      const existing = await prisma.bill.findFirst({
        where: { transactionId: parsed.data.transactionId, id: { not: billId } },
      })
      if (existing) return badRequest('This transaction is already linked to another bill')
    }
    const updated = await prisma.bill.update({
      where: { id: billId },
      data: {
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.transactionId !== undefined && { transactionId: parsed.data.transactionId }),
        ...(parsed.data.paidDate !== undefined && {
          paidDate: parsed.data.paidDate ? new Date(parsed.data.paidDate) : null,
        }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        ...(parsed.data.billNumber !== undefined && { billNumber: parsed.data.billNumber }),
        ...(parsed.data.dueDate !== undefined && {
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        }),
      },
      include: {
        vendor: { select: { id: true, name: true } },
        transaction: { select: { id: true, date: true, amount: true, description: true } },
      },
    })
    // If marked PAID, update work order to PAID if all bills are paid
    if (parsed.data.status === 'PAID') {
      const unpaidBills = await prisma.bill.count({
        where: { workOrderId: woId, status: { not: 'PAID' }, id: { not: billId } },
      })
      if (unpaidBills === 0) {
        await prisma.workOrder.update({ where: { id: woId }, data: { status: 'PAID' } })
      }
    }
    return ok(updated)
  } catch {
    return serverError('Failed to update bill')
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, woId, billId } = await params
    const workOrder = await prisma.workOrder.findFirst({ where: { id: woId, workspaceId: id, userId } })
    if (!workOrder) return notFound('Work order not found')
    const bill = await prisma.bill.findFirst({ where: { id: billId, workOrderId: woId } })
    if (!bill) return notFound('Bill not found')
    await prisma.bill.delete({ where: { id: billId } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete bill')
  }
}

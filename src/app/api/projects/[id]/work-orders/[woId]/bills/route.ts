import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateBillSchema = z.object({
  vendorId: z.string().min(1, 'Vendor is required'),
  billNumber: z.string().optional(),
  amount: z.number().positive('Amount must be positive'),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().optional(),
  fileUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  notes: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; woId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, woId } = await params
    const workOrder = await prisma.workOrder.findFirst({ where: { id: woId, workspaceId: id, userId } })
    if (!workOrder) return notFound('Work order not found')
    const body = await request.json()
    const parsed = CreateBillSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    // Validate vendor belongs to this user
    const vendor = await prisma.vendor.findFirst({ where: { id: parsed.data.vendorId, userId } })
    if (!vendor) return badRequest('Vendor not found')
    const bill = await prisma.bill.create({
      data: {
        workOrderId: woId,
        vendorId: parsed.data.vendorId,
        billNumber: parsed.data.billNumber ?? null,
        amount: parsed.data.amount,
        issueDate: new Date(parsed.data.issueDate),
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        fileUrl: parsed.data.fileUrl ?? null,
        fileName: parsed.data.fileName ?? null,
        notes: parsed.data.notes ?? null,
      },
      include: {
        vendor: { select: { id: true, name: true } },
        transaction: { select: { id: true, date: true, amount: true, description: true } },
      },
    })
    // Auto-set work order status to BILLED if all conditions met
    await prisma.workOrder.update({
      where: { id: woId },
      data: { status: 'BILLED' },
    })
    return created(bill)
  } catch {
    return serverError('Failed to create bill')
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  specialty: z.string().optional(),
  notes: z.string().optional(),
})

interface RouteParams { params: Promise<{ vendorId: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { vendorId } = await params
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, userId },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        workOrders: {
          include: {
            bills: { include: { transaction: { select: { id: true, date: true, amount: true, description: true } } } },
            workspace: { select: { id: true, name: true, slug: true } },
            job: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        bills: {
          include: { workOrder: { select: { id: true, title: true } } },
          orderBy: { issueDate: 'desc' },
        },
      },
    })
    if (!vendor) return notFound('Vendor not found')
    return ok(vendor)
  } catch {
    return serverError('Failed to fetch vendor')
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { vendorId } = await params
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId } })
    if (!vendor) return notFound('Vendor not found')
    const body = await request.json()
    const parsed = UpdateVendorSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.email !== undefined && { email: parsed.data.email || null }),
        ...(parsed.data.phone !== undefined && { phone: parsed.data.phone || null }),
        ...(parsed.data.taxId !== undefined && { taxId: parsed.data.taxId || null }),
        ...(parsed.data.specialty !== undefined && { specialty: parsed.data.specialty || null }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes || null }),
      },
    })
    return ok(updated)
  } catch {
    return serverError('Failed to update vendor')
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { vendorId } = await params
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId } })
    if (!vendor) return notFound('Vendor not found')
    await prisma.vendor.delete({ where: { id: vendorId } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete vendor')
  }
}

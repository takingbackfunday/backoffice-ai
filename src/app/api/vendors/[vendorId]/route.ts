import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireVendor } from '@/lib/authz'

const ParamsSchema = z.object({ vendorId: z.string() })

const UpdateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  specialty: z.string().optional(),
  notes: z.string().optional(),
})

export const GET = authedRoute<{ vendorId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    await requireVendor(userId, params.vendorId)
    const vendor = await prisma.vendor.findUnique({
      where: { id: params.vendorId },
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
    return ok(vendor)
  },
})

export const PATCH = authedRoute<{ vendorId: string }, z.infer<typeof UpdateVendorSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: UpdateVendorSchema,
  handler: async ({ userId, params, body }) => {
    await requireVendor(userId, params.vendorId)
    const updated = await prisma.vendor.update({
      where: { id: params.vendorId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.email !== undefined && { email: body.email || null }),
        ...(body.phone !== undefined && { phone: body.phone || null }),
        ...(body.taxId !== undefined && { taxId: body.taxId || null }),
        ...(body.specialty !== undefined && { specialty: body.specialty || null }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
      },
    })
    return ok(updated)
  },
})

export const DELETE = authedRoute<{ vendorId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    await requireVendor(userId, params.vendorId)
    await prisma.vendor.delete({ where: { id: params.vendorId } })
    return ok({ deleted: true })
  },
})

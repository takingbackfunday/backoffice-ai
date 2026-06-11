import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'

const CreateVendorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  specialty: z.string().optional(),
  notes: z.string().optional(),
})

export const GET = authedRoute({
  handler: async ({ userId }) => {
    const vendors = await prisma.vendor.findMany({
      where: { userId },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        _count: { select: { workOrders: true, bills: true } },
      },
      orderBy: { name: 'asc' },
    })
    return ok(vendors, { count: vendors.length })
  },
})

export const POST = authedRoute<void, z.infer<typeof CreateVendorSchema>>({
  bodySchema: CreateVendorSchema,
  handler: async ({ userId, body }) => {
    const vendor = await prisma.vendor.create({
      data: {
        userId,
        name: body.name,
        email: body.email || null,
        phone: body.phone || null,
        taxId: body.taxId || null,
        specialty: body.specialty || null,
        notes: body.notes || null,
      },
    })
    return created(vendor)
  },
})

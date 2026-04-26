import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, serverError } from '@/lib/api-response'

const CreateVendorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  specialty: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const vendors = await prisma.vendor.findMany({
      where: { userId },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        _count: { select: { workOrders: true, bills: true } },
      },
      orderBy: { name: 'asc' },
    })
    return ok(vendors, { count: vendors.length })
  } catch {
    return serverError('Failed to fetch vendors')
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const body = await request.json()
    const parsed = CreateVendorSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    const vendor = await prisma.vendor.create({
      data: {
        userId,
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        taxId: parsed.data.taxId || null,
        specialty: parsed.data.specialty || null,
        notes: parsed.data.notes || null,
      },
    })
    return created(vendor)
  } catch {
    return serverError('Failed to create vendor')
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; tenantId: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { tenantId } = await params

    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, userId },
      include: {
        leases: {
          include: {
            unit: true,
            tenantCharges: { orderBy: { dueDate: 'desc' } },
            tenantPayments: { orderBy: { paidDate: 'desc' } },
          },
          orderBy: { startDate: 'desc' },
        },
        tenantFiles: { orderBy: { createdAt: 'desc' } },
        messages: { orderBy: { createdAt: 'desc' }, take: 50 },
        maintenanceRequests: { orderBy: { createdAt: 'desc' } },
      },
    })

    if (!tenant) return notFound('Tenant not found')
    return ok(tenant)
  } catch {
    return serverError('Failed to fetch tenant')
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { tenantId } = await params

    const existing = await prisma.tenant.findFirst({ where: { id: tenantId, userId } })
    if (!existing) return notFound('Tenant not found')

    const body = await request.json()
    const parsed = UpdateTenantSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: parsed.data,
    })

    return ok(tenant)
  } catch {
    return serverError('Failed to update tenant')
  }
}

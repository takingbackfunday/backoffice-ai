import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateTenantSchema = z.object({
  name: z.string().min(1, 'Tenant name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const tenants = await prisma.tenant.findMany({
      where: {
        userId,
        leases: { some: { unitId: { in: unitIds } } },
      },
      include: {
        leases: {
          where: { unitId: { in: unitIds } },
          include: { unit: true },
          orderBy: { startDate: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    return ok(tenants, { count: tenants.length })
  } catch {
    return serverError('Failed to fetch tenants')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
    })
    if (!project) return notFound('Property project not found')

    const body = await request.json()
    const parsed = CreateTenantSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const existing = await prisma.tenant.findUnique({
      where: { userId_email: { userId, email: parsed.data.email } },
    })
    if (existing) {
      return ok(existing)
    }

    const tenant = await prisma.tenant.create({
      data: { userId, ...parsed.data },
    })

    return created(tenant)
  } catch {
    return serverError('Failed to create tenant')
  }
}

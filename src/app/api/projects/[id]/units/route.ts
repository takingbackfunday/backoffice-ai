import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateUnitSchema = z.object({
  unitLabel: z.string().min(1, 'Unit label is required'),
  status: z.enum(['VACANT', 'LEASED', 'NOTICE_GIVEN', 'PREPARING', 'MAINTENANCE', 'LISTED']).optional(),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().optional(),
  squareFootage: z.number().int().optional(),
  monthlyRent: z.number().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const units = await prisma.unit.findMany({
      where: { propertyProfileId: project.propertyProfile.id },
      include: {
        leases: {
          where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
          include: { tenant: true },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
        _count: { select: { maintenanceRequests: true } },
      },
      orderBy: { unitLabel: 'asc' },
    })

    return ok(units, { count: units.length })
  } catch {
    return serverError('Failed to fetch units')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const body = await request.json()
    const parsed = CreateUnitSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const unit = await prisma.unit.create({
      data: {
        propertyProfileId: project.propertyProfile.id,
        ...parsed.data,
      },
    })

    return created(unit)
  } catch {
    return serverError('Failed to create unit')
  }
}

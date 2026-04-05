import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  client: z.object({
    contactName: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    company: z.string().optional(),
    address: z.string().optional(),
    billingType: z.enum(['HOURLY', 'FIXED', 'RETAINER', 'MILESTONE']).optional(),
    defaultRate: z.number().optional(),
    currency: z.string().optional(),
    paymentTermDays: z.number().int().min(0).optional(),
  }).optional(),
  property: z.object({
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
    propertyType: z.enum(['RESIDENTIAL', 'MULTI_FAMILY', 'COMMERCIAL', 'MIXED_USE', 'LAND']).optional(),
    yearBuilt: z.number().int().optional(),
    squareFootage: z.number().int().optional(),
    lotSize: z.string().optional(),
    purchasePrice: z.number().optional(),
    purchaseDate: z.string().optional(),
    currentValue: z.number().optional(),
    mortgageBalance: z.number().optional(),
  }).optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId },
      include: {
        clientProfile: { include: { jobs: { orderBy: { createdAt: 'desc' } } } },
        propertyProfile: {
          include: {
            units: {
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
            },
          },
        },
        _count: { select: { transactions: true } },
      },
    })

    if (!project) return notFound('Project not found')
    return ok(project)
  } catch {
    return serverError('Failed to fetch project')
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const existing = await prisma.workspace.findFirst({ where: { id, userId } })
    if (!existing) return notFound('Project not found')

    const body = await request.json()
    const parsed = UpdateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { name, description, isActive, client, property } = parsed.data

    const project = await prisma.workspace.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(client && existing.type === 'CLIENT' ? {
          clientProfile: { update: client },
        } : {}),
        ...(property && existing.type === 'PROPERTY' ? {
          propertyProfile: {
            update: {
              ...property,
              purchaseDate: property.purchaseDate ? new Date(property.purchaseDate) : undefined,
            },
          },
        } : {}),
      },
      include: {
        clientProfile: true,
        propertyProfile: true,
      },
    })

    return ok(project)
  } catch {
    return serverError('Failed to update project')
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const existing = await prisma.workspace.findFirst({ where: { id, userId } })
    if (!existing) return notFound('Project not found')

    await prisma.workspace.delete({ where: { id } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete project')
  }
}

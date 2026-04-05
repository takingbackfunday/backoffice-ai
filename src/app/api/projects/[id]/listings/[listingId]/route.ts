import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateListingSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  monthlyRent: z.number().min(0).optional(),
  availableDate: z.string().nullable().optional(),
  petPolicy: z.string().nullable().optional(),
  photos: z.array(z.string()).optional(),
  amenities: z.string().nullable().optional(),
  applicationFee: z.number().nullable().optional(),
  screeningFee: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
})

interface RouteParams { params: Promise<{ id: string; listingId: string }> }

async function getPropertyProject(id: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id, userId, type: 'PROPERTY' },
    include: { propertyProfile: { include: { units: { select: { id: true } } } } },
  })
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, listingId } = await params

    const project = await getPropertyProject(id, userId)
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const listing = await prisma.listing.findFirst({
      where: { id: listingId, unitId: { in: unitIds }, userId },
      include: {
        unit: { select: { id: true, unitLabel: true, status: true } },
        _count: { select: { applicants: true } },
      },
    })
    if (!listing) return notFound('Listing not found')

    return ok(listing)
  } catch {
    return serverError('Failed to fetch listing')
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, listingId } = await params

    const project = await getPropertyProject(id, userId)
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const existing = await prisma.listing.findFirst({
      where: { id: listingId, unitId: { in: unitIds }, userId },
      include: { unit: { select: { id: true, status: true } } },
    })
    if (!existing) return notFound('Listing not found')

    const body = await request.json()
    const parsed = UpdateListingSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const { isActive, ...rest } = parsed.data

    const updateData: Record<string, unknown> = { ...rest }
    if (parsed.data.availableDate !== undefined) {
      updateData.availableDate = parsed.data.availableDate ? new Date(parsed.data.availableDate) : null
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive
    }

    const listing = await prisma.$transaction(async (tx) => {
      const updated = await tx.listing.update({
        where: { id: listingId },
        data: updateData,
        include: {
          unit: { select: { id: true, unitLabel: true, status: true } },
          _count: { select: { applicants: true } },
        },
      })

      // When deactivating a listing, revert unit to VACANT if currently LISTED
      if (isActive === false && existing.unit.status === 'LISTED') {
        await tx.unit.update({
          where: { id: existing.unit.id },
          data: { status: 'VACANT' },
        })
      }

      return updated
    })

    return ok(listing)
  } catch {
    return serverError('Failed to update listing')
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, listingId } = await params

    const project = await getPropertyProject(id, userId)
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const existing = await prisma.listing.findFirst({
      where: { id: listingId, unitId: { in: unitIds }, userId },
      include: {
        unit: { select: { id: true, status: true } },
        _count: { select: { applicants: true } },
      },
    })
    if (!existing) return notFound('Listing not found')

    await prisma.$transaction(async (tx) => {
      if (existing._count.applicants === 0) {
        await tx.listing.delete({ where: { id: listingId } })
      } else {
        await tx.listing.update({ where: { id: listingId }, data: { isActive: false } })
      }

      if (existing.unit.status === 'LISTED') {
        await tx.unit.update({ where: { id: existing.unit.id }, data: { status: 'VACANT' } })
      }
    })

    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete listing')
  }
}

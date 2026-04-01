import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { generateListingSlug } from '@/lib/listing-slug'

const CreateListingSchema = z.object({
  unitId: z.string().min(1, 'Unit is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  monthlyRent: z.number().min(0, 'Monthly rent must be non-negative'),
  availableDate: z.string().optional(),
  petPolicy: z.string().optional(),
  photos: z.array(z.string()).optional().default([]),
  amenities: z.string().optional(),
  applicationFee: z.number().optional(),
  screeningFee: z.number().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

async function getPropertyProject(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId, type: 'PROPERTY' },
    include: { propertyProfile: { include: { units: true } } },
  })
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await getPropertyProject(id, userId)
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const listings = await prisma.listing.findMany({
      where: { unitId: { in: unitIds }, userId },
      include: {
        unit: { select: { id: true, unitLabel: true, status: true } },
        _count: { select: { applicants: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(listings, { count: listings.length })
  } catch {
    return serverError('Failed to fetch listings')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await getPropertyProject(id, userId)
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const body = await request.json()
    const parsed = CreateListingSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    // Verify unit belongs to this property
    const unit = await prisma.unit.findFirst({
      where: { id: parsed.data.unitId, propertyProfileId: project.propertyProfile.id },
    })
    if (!unit) return badRequest('Unit does not belong to this property')

    const publicSlug = await generateListingSlug(project.name, unit.unitLabel)

    const listing = await prisma.$transaction(async (tx) => {
      const newListing = await tx.listing.create({
        data: {
          unitId: parsed.data.unitId,
          userId,
          title: parsed.data.title,
          description: parsed.data.description,
          monthlyRent: parsed.data.monthlyRent,
          availableDate: parsed.data.availableDate ? new Date(parsed.data.availableDate) : undefined,
          petPolicy: parsed.data.petPolicy,
          photos: parsed.data.photos,
          amenities: parsed.data.amenities,
          applicationFee: parsed.data.applicationFee,
          screeningFee: parsed.data.screeningFee,
          publicSlug,
        },
        include: {
          unit: { select: { id: true, unitLabel: true, status: true } },
        },
      })

      // Update unit status to LISTED
      await tx.unit.update({
        where: { id: parsed.data.unitId },
        data: { status: 'LISTED' },
      })

      return newListing
    })

    return created(listing)
  } catch {
    return serverError('Failed to create listing')
  }
}

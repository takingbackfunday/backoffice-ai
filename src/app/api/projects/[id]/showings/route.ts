import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateShowingSchema = z.object({
  applicantId: z.string().min(1),
  unitId: z.string().min(1),
  scheduledAt: z.string().min(1, 'Scheduled time is required'),
  durationMin: z.number().int().optional().default(30),
  notes: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

async function getPropertyProfile(id: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id, userId, type: 'PROPERTY' },
    include: { propertyProfile: { include: { units: { select: { id: true } } } } },
  })
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await getPropertyProfile(id, userId)
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const showings = await prisma.showing.findMany({
      where: { unitId: { in: unitIds } },
      include: {
        applicant: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, unitLabel: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    })

    return ok(showings, { count: showings.length })
  } catch {
    return serverError('Failed to fetch showings')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await getPropertyProfile(id, userId)
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const body = await request.json()
    const parsed = CreateShowingSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    // Verify unit belongs to this property
    if (!unitIds.includes(parsed.data.unitId)) {
      return badRequest('Unit does not belong to this property')
    }

    // Verify applicant belongs to this property
    const applicant = await prisma.applicant.findFirst({
      where: { id: parsed.data.applicantId, propertyProfileId: project.propertyProfile.id },
    })
    if (!applicant) return badRequest('Applicant not found')

    const showing = await prisma.$transaction(async (tx) => {
      const newShowing = await tx.showing.create({
        data: {
          applicantId: parsed.data.applicantId,
          unitId: parsed.data.unitId,
          scheduledAt: new Date(parsed.data.scheduledAt),
          durationMin: parsed.data.durationMin,
          notes: parsed.data.notes,
          status: 'PROPOSED',
        },
        include: {
          applicant: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, unitLabel: true } },
        },
      })

      // Auto-advance applicant from INQUIRY to APPLICATION_SENT
      if (applicant.status === 'INQUIRY') {
        await tx.applicant.update({
          where: { id: parsed.data.applicantId },
          data: { status: 'APPLICATION_SENT' },
        })
      }

      return newShowing
    })

    return created(showing)
  } catch {
    return serverError('Failed to schedule showing')
  }
}

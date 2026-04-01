import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateApplicantSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  unitId: z.string().nullable().optional(),
  source: z.string().optional(),
  desiredMoveIn: z.string().nullable().optional(),
  desiredRent: z.number().nullable().optional(),
  currentEmployer: z.string().optional(),
  annualIncome: z.number().nullable().optional(),
  notes: z.string().optional(),
  creditScore: z.number().int().nullable().optional(),
  backgroundCheck: z.string().nullable().optional(),
  status: z.enum(['INQUIRY', 'APPLICATION_SENT', 'APPLIED', 'SCREENING', 'APPROVED', 'LEASE_OFFERED', 'LEASE_SIGNED', 'REJECTED', 'WITHDRAWN']).optional(),
  rejectedReason: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; applicantId: string }> }

async function getPropertyProfile(id: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id, userId, type: 'PROPERTY' },
    include: { propertyProfile: true },
  })
  return project?.propertyProfile ?? null
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, applicantId } = await params

    const propertyProfile = await getPropertyProfile(id, userId)
    if (!propertyProfile) return notFound('Property project not found')

    const applicant = await prisma.applicant.findFirst({
      where: { id: applicantId, propertyProfileId: propertyProfile.id },
      include: {
        unit: { select: { id: true, unitLabel: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        convertedToTenant: { select: { id: true, name: true, email: true } },
        listing: { select: { id: true, publicSlug: true, title: true } },
      },
    })
    if (!applicant) return notFound('Applicant not found')

    return ok(applicant)
  } catch {
    return serverError('Failed to fetch applicant')
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, applicantId } = await params

    const propertyProfile = await getPropertyProfile(id, userId)
    if (!propertyProfile) return notFound('Property project not found')

    const existing = await prisma.applicant.findFirst({
      where: { id: applicantId, propertyProfileId: propertyProfile.id },
    })
    if (!existing) return notFound('Applicant not found')

    const body = await request.json()
    const parsed = UpdateApplicantSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const { status, rejectedReason, ...rest } = parsed.data

    // Validate rejection requires a reason
    if (status === 'REJECTED' && !rejectedReason && !existing.rejectedReason) {
      return badRequest('rejectedReason is required when rejecting an applicant')
    }

    // Validate unitId if provided
    if (rest.unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: rest.unitId, propertyProfileId: propertyProfile.id },
      })
      if (!unit) return badRequest('Unit does not belong to this property')
    }

    const updateData: Record<string, unknown> = { ...rest }

    if (rest.desiredMoveIn !== undefined) {
      updateData.desiredMoveIn = rest.desiredMoveIn ? new Date(rest.desiredMoveIn) : null
    }

    if (status) {
      updateData.status = status
      if (status === 'REJECTED') {
        updateData.rejectedAt = new Date()
        if (rejectedReason) updateData.rejectedReason = rejectedReason
      }
    }

    const applicant = await prisma.applicant.update({
      where: { id: applicantId },
      data: updateData,
      include: {
        unit: { select: { id: true, unitLabel: true } },
        _count: { select: { documents: true } },
      },
    })

    return ok(applicant)
  } catch {
    return serverError('Failed to update applicant')
  }
}

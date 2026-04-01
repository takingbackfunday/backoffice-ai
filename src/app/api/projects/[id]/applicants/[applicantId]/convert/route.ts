import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; applicantId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, applicantId } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const applicant = await prisma.applicant.findFirst({
      where: { id: applicantId, propertyProfileId: project.propertyProfile.id },
    })
    if (!applicant) return notFound('Applicant not found')

    if (!['APPROVED', 'LEASE_SIGNED'].includes(applicant.status)) {
      return badRequest('Applicant must be APPROVED or LEASE_SIGNED to convert to tenant')
    }

    if (applicant.convertedToTenantId) {
      return badRequest('Applicant has already been converted to a tenant')
    }

    // Check for duplicate email
    const existingTenant = await prisma.tenant.findFirst({
      where: { userId, email: applicant.email },
    })
    if (existingTenant) {
      return badRequest(`A tenant with email ${applicant.email} already exists`)
    }

    const result = await prisma.$transaction(async tx => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          userId,
          name: applicant.name,
          email: applicant.email,
          phone: applicant.phone ?? undefined,
        },
      })

      // Link applicant → tenant
      await tx.applicant.update({
        where: { id: applicantId },
        data: {
          convertedToTenantId: tenant.id,
          convertedAt: new Date(),
          status: 'LEASE_SIGNED',
        },
      })

      // If a DRAFT lease exists for this unit, link it to the new tenant and activate it
      if (applicant.unitId) {
        const draftLease = await tx.lease.findFirst({
          where: { unitId: applicant.unitId, status: 'DRAFT' },
          orderBy: { createdAt: 'desc' },
        })
        if (draftLease) {
          await tx.lease.update({
            where: { id: draftLease.id },
            data: { tenantId: tenant.id, status: 'ACTIVE' },
          })
          await tx.unit.update({
            where: { id: applicant.unitId },
            data: { status: 'LEASED' },
          })
        }
      }

      return tenant
    })

    return ok(result)
  } catch {
    return serverError('Failed to convert applicant to tenant')
  }
}

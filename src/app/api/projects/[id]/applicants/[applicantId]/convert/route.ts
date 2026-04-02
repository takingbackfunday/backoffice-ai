import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { NextResponse } from 'next/server'

interface RouteParams { params: Promise<{ id: string; applicantId: string }> }

const BodySchema = z.object({
  linkToTenantId: z.string().optional(), // if set, link to existing tenant instead of creating new
})

export async function POST(request: Request, { params }: RouteParams) {
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

    const body = await request.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return badRequest('Invalid request body')
    const { linkToTenantId } = parsed.data

    // If linking to an existing tenant — reconciliation path
    if (linkToTenantId) {
      const targetTenant = await prisma.tenant.findFirst({ where: { id: linkToTenantId, userId } })
      if (!targetTenant) return notFound('Tenant not found')

      const result = await prisma.$transaction(async tx => {
        await tx.applicant.update({
          where: { id: applicantId },
          data: { convertedToTenantId: targetTenant.id, convertedAt: new Date(), status: 'LEASE_SIGNED' },
        })
        if (applicant.unitId) {
          const draftLease = await tx.lease.findFirst({
            where: { unitId: applicant.unitId, status: 'DRAFT' },
            orderBy: { createdAt: 'desc' },
          })
          if (draftLease) {
            await tx.lease.update({ where: { id: draftLease.id }, data: { tenantId: targetTenant.id, status: 'ACTIVE' } })
            await tx.unit.update({ where: { id: applicant.unitId }, data: { status: 'LEASED' } })
          }
        }
        return targetTenant
      })
      return ok(result)
    }

    // Normal path — check for duplicate email
    const existingTenant = await prisma.tenant.findFirst({ where: { userId, email: applicant.email } })
    if (existingTenant) {
      return NextResponse.json(
        {
          error: `A tenant named "${existingTenant.name}" already exists with this email.`,
          existingTenant: { id: existingTenant.id, name: existingTenant.name, email: existingTenant.email },
        },
        { status: 409 }
      )
    }

    const result = await prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({
        data: { userId, name: applicant.name, email: applicant.email, phone: applicant.phone ?? undefined },
      })
      await tx.applicant.update({
        where: { id: applicantId },
        data: { convertedToTenantId: tenant.id, convertedAt: new Date(), status: 'LEASE_SIGNED' },
      })
      if (applicant.unitId) {
        const draftLease = await tx.lease.findFirst({
          where: { unitId: applicant.unitId, status: 'DRAFT' },
          orderBy: { createdAt: 'desc' },
        })
        if (draftLease) {
          await tx.lease.update({ where: { id: draftLease.id }, data: { tenantId: tenant.id, status: 'ACTIVE' } })
          await tx.unit.update({ where: { id: applicant.unitId }, data: { status: 'LEASED' } })
        }
      }
      return tenant
    })

    return ok(result)
  } catch {
    return serverError('Failed to convert applicant to tenant')
  }
}

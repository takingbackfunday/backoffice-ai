import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { generateLeaseContractPdf } from '@/lib/pdf/lease-contract-pdf'
import { sendLeaseContractEmail } from '@/lib/email'

const CountersignSchema = z.object({
  signatureName: z.string().min(2, 'Signature name must be at least 2 characters'),
})

interface RouteParams { params: Promise<{ id: string; leaseId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, leaseId } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: {
        propertyProfile: {
          include: { units: { select: { id: true } } },
        },
      },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const existing = await prisma.lease.findFirst({
      where: { id: leaseId, unitId: { in: unitIds } },
      include: { unit: true, tenant: true },
    })
    if (!existing) return notFound('Lease not found')
    if (existing.contractStatus !== 'SIGNED') {
      return badRequest('Lease must be tenant-signed before countersigning')
    }

    const body = await request.json()
    const parsed = CountersignSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const lease = await prisma.$transaction(async (tx) => {
      const updated = await tx.lease.update({
        where: { id: leaseId },
        data: {
          ownerSignatureName: parsed.data.signatureName,
          ownerSignedAt: new Date(),
          contractStatus: 'COUNTERSIGNED',
          status: 'ACTIVE',
          contractSignedAt: new Date(),
        },
        include: { unit: true, tenant: true },
      })

      // Update unit to LEASED
      await tx.unit.update({
        where: { id: existing.unitId },
        data: { status: 'LEASED' },
      })

      return updated
    })

    // Email final countersigned lease to tenant
    try {
      const prefs = await prisma.userPreference.findUnique({ where: { userId } })
      const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
      const ownerName = (prefsData.displayName as string | undefined) ?? 'Property Manager'

      const contractData = {
        ownerName,
        tenantName: lease.tenant.name,
        tenantEmail: lease.tenant.email,
        tenantPhone: lease.tenant.phone ?? null,
        propertyName: project.name,
        propertyAddress: project.propertyProfile.address ?? null,
        unitLabel: lease.unit.unitLabel,
        startDate: lease.startDate.toISOString(),
        endDate: lease.endDate.toISOString(),
        monthlyRent: Number(lease.monthlyRent),
        securityDeposit: lease.securityDeposit ? Number(lease.securityDeposit) : null,
        currency: lease.currency ?? 'USD',
        paymentDueDay: lease.paymentDueDay ?? 1,
        lateFeeAmount: lease.lateFeeAmount ? Number(lease.lateFeeAmount) : null,
        lateFeeGraceDays: lease.lateFeeGraceDays ?? 5,
        contractNotes: lease.contractNotes ?? null,
        generatedAt: new Date().toISOString(),
      }
      const pdfBuffer = await generateLeaseContractPdf(contractData)
      await sendLeaseContractEmail({
        toEmail: lease.tenant.email,
        toName: lease.tenant.name,
        fromName: ownerName,
        propertyName: project.name,
        unitLabel: lease.unit.unitLabel,
        startDate: lease.startDate.toISOString(),
        endDate: lease.endDate.toISOString(),
        pdfBuffer,
      })
    } catch {
      // Email failure is non-fatal
    }

    return ok(lease)
  } catch {
    return serverError('Failed to countersign lease')
  }
}

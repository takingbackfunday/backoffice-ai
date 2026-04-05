import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { generateLeaseContractPdf } from '@/lib/pdf/lease-contract-pdf'
import { sendLeaseContractEmail } from '@/lib/email'

interface RouteParams { params: Promise<{ id: string; leaseId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, leaseId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: {
        propertyProfile: {
          include: { units: { select: { id: true } } },
        },
      },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, unitId: { in: unitIds } },
      include: { unit: true, tenant: true },
    })
    if (!lease) return notFound('Lease not found')
    if (!lease.tenant.email) return badRequest('Tenant has no email address on file')

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
    const ownerName = (prefsData.displayName as string | undefined)
      ?? (prefsData.businessName as string | undefined)
      ?? 'Owner'

    const contractData = {
      ownerName,
      tenantName: lease.tenant.name,
      tenantEmail: lease.tenant.email,
      tenantPhone: lease.tenant.phone,
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
      contractNotes: lease.contractNotes,
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

    const updated = await prisma.lease.update({
      where: { id: leaseId },
      data: {
        contractStatus: 'SENT',
        contractSentAt: new Date(),
      },
    })

    return ok({ contractStatus: updated.contractStatus, sentTo: lease.tenant.email })
  } catch {
    return serverError('Failed to send contract')
  }
}

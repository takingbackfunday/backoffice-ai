import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'
import { generateLeaseContractPdf } from '@/lib/pdf/lease-contract-pdf'
import { parsePreferences } from '@/types/preferences'

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
      include: {
        unit: true,
        tenant: true,
      },
    })
    if (!lease) return notFound('Lease not found')

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = parsePreferences(prefs?.data)
    const ownerName = prefsData.displayName ?? 'Owner'

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

    const updated = await prisma.lease.update({
      where: { id: leaseId },
      data: { contractStatus: 'READY' },
    })

    return ok({
      contractStatus: updated.contractStatus,
      pdfSize: pdfBuffer.length,
    })
  } catch {
    return serverError('Failed to generate contract')
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
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
      include: {
        unit: true,
        tenant: true,
      },
    })
    if (!lease) return notFound('Lease not found')

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = parsePreferences(prefs?.data)
    const ownerName = prefsData.displayName ?? 'Owner'

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

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="lease-contract-${leaseId}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch {
    return serverError('Failed to generate contract PDF')
  }
}

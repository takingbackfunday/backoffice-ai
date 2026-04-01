import { prisma } from '@/lib/prisma'
import { generateLeaseContractPdf } from '@/lib/pdf/lease-contract-pdf'
import { notFound } from 'next/navigation'

interface RouteParams { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { token } = await params

    const lease = await prisma.lease.findFirst({
      where: { signingToken: token },
      include: {
        unit: {
          include: {
            propertyProfile: {
              include: { project: { select: { id: true, name: true, userId: true } } },
            },
          },
        },
        tenant: true,
      },
    })
    if (!lease) return notFound()

    const prefs = await prisma.userPreference.findUnique({
      where: { userId: lease.unit.propertyProfile.project.userId },
    })
    const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
    const ownerName = (prefsData.displayName as string | undefined) ?? 'Property Manager'

    const contractData = {
      ownerName,
      tenantName: lease.tenant.name,
      tenantEmail: lease.tenant.email,
      tenantPhone: lease.tenant.phone ?? null,
      propertyName: lease.unit.propertyProfile.project.name,
      propertyAddress: lease.unit.propertyProfile.address ?? null,
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

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="lease-${lease.unit.unitLabel.replace(/\s+/g, '-')}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch {
    return new Response('Failed to generate PDF', { status: 500 })
  }
}

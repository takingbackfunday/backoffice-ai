import { auth, clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { sendWelcomeEmail } from '@/lib/email'
import { parsePreferences } from '@/types/preferences'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

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
        unit: { select: { unitLabel: true } },
        tenant: true,
      },
    })
    if (!lease) return notFound('Lease not found')
    if (lease.status !== 'ACTIVE') return badRequest('Lease must be ACTIVE')
    if (lease.contractStatus !== 'COUNTERSIGNED') return badRequest('Lease must be countersigned before handing over keys')
    if (lease.keysHandedOverAt) return badRequest('Keys have already been handed over')

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = parsePreferences(prefs?.data)
    const ownerName = prefsData.displayName ?? 'Property Manager'

    const updated = await prisma.lease.update({
      where: { id: leaseId },
      data: { keysHandedOverAt: new Date() },
    })

    // Invite tenant to portal if not already invited
    if (lease.tenant.portalInviteStatus === 'NONE') {
      try {
        const clerk = await clerkClient()
        await clerk.invitations.createInvitation({
          emailAddress: lease.tenant.email,
          publicMetadata: { role: 'tenant', tenantId: lease.tenant.id },
          ignoreExisting: true,
        })
        await prisma.tenant.update({
          where: { id: lease.tenant.id },
          data: { portalInviteStatus: 'INVITED' },
        })
      } catch {
        // Portal invite failure is non-fatal
      }
    }

    // Send welcome email
    try {
      await sendWelcomeEmail({
        toEmail: lease.tenant.email,
        toName: lease.tenant.name,
        propertyName: project.name,
        unitLabel: lease.unit.unitLabel,
        ownerName,
        portalUrl: `${APP_URL}/portal`,
        moveInDate: lease.startDate.toISOString(),
      })
    } catch {
      // Email failure is non-fatal
    }

    return ok(updated)
  } catch {
    return serverError('Failed to record key handover')
  }
}

import { prisma } from '@/lib/prisma'
import { ok, created, unauthorized, badRequest, serverError } from '@/lib/api-response'
import { getPortalSession } from '@/lib/portal-auth'
import { sendOwnerMessageNotification } from '@/lib/email'

export async function GET(req: Request) {
  try {
    const session = await getPortalSession()
    if (!session) return unauthorized('Not a tenant account')

    const { searchParams } = new URL(req.url)
    const unitId = searchParams.get('unitId')
    if (!unitId) return badRequest('unitId required')

    const messages = await prisma.message.findMany({
      where: { tenantId: session.tenantId, unitId },
      orderBy: { createdAt: 'asc' },
    })

    return ok(messages)
  } catch {
    return serverError('Failed to fetch messages')
  }
}

export async function POST(req: Request) {
  try {
    const session = await getPortalSession()
    if (!session) return unauthorized('Not a tenant account')

    const { unitId, subject, body } = await req.json()
    if (!unitId || !body?.trim()) return badRequest('unitId and body are required')

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { name: true, email: true, userId: true },
    })
    if (!tenant) return unauthorized('Tenant not found')

    const message = await prisma.message.create({
      data: {
        tenantId: session.tenantId,
        unitId,
        subject: subject?.trim() || null,
        body: body.trim(),
        senderRole: 'tenant',
      },
    })

    // Find the owner's email via Clerk and notify them (fire-and-forget)
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      include: { propertyProfile: { include: { project: true } } },
    })
    if (unit?.propertyProfile?.project) {
      const { clerkClient } = await import('@clerk/nextjs/server')
      const clerk = await clerkClient()
      const owner = await clerk.users.getUser(unit.propertyProfile.project.userId)
      const ownerEmail = owner.emailAddresses.find(e => e.id === owner.primaryEmailAddressId)?.emailAddress
      if (ownerEmail) {
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'
        sendOwnerMessageNotification({
          toEmail: ownerEmail,
          toName: owner.firstName ?? 'there',
          subject: subject?.trim() || 'New message',
          body: body.trim(),
          tenantName: tenant.name,
          portalUrl: `${APP_URL}/projects/${unit.propertyProfile.project.slug}/messages/${session.tenantId}`,
        }).catch(() => {})
      }
    }

    return created(message)
  } catch {
    return serverError('Failed to send message')
  }
}

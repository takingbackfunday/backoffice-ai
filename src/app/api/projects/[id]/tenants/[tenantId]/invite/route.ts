import { auth, clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; tenantId: string }> }

export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id: projectId, tenantId } = await params

    // Verify project ownership
    const project = await prisma.workspace.findFirst({
      where: { id: projectId, userId, type: 'PROPERTY' },
    })
    if (!project) return notFound('Project not found')

    // Verify tenant ownership
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, userId },
    })
    if (!tenant) return notFound('Tenant not found')
    if (!tenant.email) return badRequest('Tenant has no email address')

    const clerk = await clerkClient()

    // Create Clerk invitation — sets publicMetadata on the user when they sign up
    await clerk.invitations.createInvitation({
      emailAddress: tenant.email,
      publicMetadata: {
        role: 'tenant',
        tenantId: tenant.id,
      },
      ignoreExisting: true,
    })

    // Mark tenant as invited
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { portalInviteStatus: 'INVITED' },
    })

    return ok(updated)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send invite'
    return serverError(msg)
  }
}

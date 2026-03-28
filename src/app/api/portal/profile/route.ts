import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'
import { getPortalSession } from '@/lib/portal-auth'

export async function GET() {
  try {
    const session = await getPortalSession()
    if (!session) return unauthorized('Not a tenant account')

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: {
        leases: {
          include: { unit: true },
          orderBy: { startDate: 'desc' },
        },
      },
    })
    if (!tenant) return notFound('Tenant not found')
    return ok(tenant)
  } catch {
    return serverError('Failed to fetch profile')
  }
}

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

function getTenantId(sessionClaims: Record<string, unknown> | null) {
  return (sessionClaims?.metadata as Record<string, string> | undefined)?.tenantId ?? null
}

export async function GET() {
  try {
    const { userId, sessionClaims } = await auth()
    if (!userId) return unauthorized()
    const tenantId = getTenantId(sessionClaims as Record<string, unknown>)
    if (!tenantId) return unauthorized('Not a tenant account')

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
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

import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { getPortalSession } from '@/lib/portal-auth'

export async function GET() {
  try {
    const session = await getPortalSession()
    if (!session) return unauthorized('Not a tenant account')

    const files = await prisma.tenantFile.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: 'desc' },
    })

    return ok(files)
  } catch {
    return serverError('Failed to fetch documents')
  }
}

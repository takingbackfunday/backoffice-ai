import { prisma } from '@/lib/prisma'
import { ok, created, unauthorized, badRequest, serverError } from '@/lib/api-response'
import { getPortalSession } from '@/lib/portal-auth'

export async function GET() {
  try {
    const session = await getPortalSession()
    if (!session) return unauthorized('Not a tenant account')

    const requests = await prisma.maintenanceRequest.findMany({
      where: { tenantId: session.tenantId },
      include: { unit: true },
      orderBy: { createdAt: 'desc' },
    })

    return ok(requests)
  } catch {
    return serverError('Failed to fetch maintenance requests')
  }
}

export async function POST(req: Request) {
  try {
    const session = await getPortalSession()
    if (!session) return unauthorized('Not a tenant account')

    const { unitId, title, description, priority } = await req.json()
    if (!unitId || !title?.trim()) return badRequest('unitId and title are required')

    const request = await prisma.maintenanceRequest.create({
      data: {
        tenantId: session.tenantId,
        unitId,
        title: title.trim(),
        description: description?.trim() ?? '',
        priority: priority ?? 'MEDIUM',
        status: 'OPEN',
      },
      include: { unit: true },
    })

    return created(request)
  } catch {
    return serverError('Failed to create maintenance request')
  }
}

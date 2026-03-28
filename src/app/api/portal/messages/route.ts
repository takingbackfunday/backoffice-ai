import { prisma } from '@/lib/prisma'
import { ok, created, unauthorized, badRequest, serverError } from '@/lib/api-response'
import { getPortalSession } from '@/lib/portal-auth'

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

    const { unitId, body } = await req.json()
    if (!unitId || !body?.trim()) return badRequest('unitId and body are required')

    const message = await prisma.message.create({
      data: {
        tenantId: session.tenantId,
        unitId,
        body: body.trim(),
        senderRole: 'tenant',
      },
    })

    return created(message)
  } catch {
    return serverError('Failed to send message')
  }
}

import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { getPortalSession } from '@/lib/portal-auth'

export async function GET() {
  try {
    const session = await getPortalSession()
    if (!session) return unauthorized('Not a tenant account')

    const payments = await prisma.rentPayment.findMany({
      where: { tenantId: session.tenantId },
      include: { lease: { include: { unit: true } } },
      orderBy: { dueDate: 'desc' },
    })

    return ok(payments)
  } catch {
    return serverError('Failed to fetch payments')
  }
}

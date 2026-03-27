import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'

function getTenantId(sessionClaims: Record<string, unknown> | null) {
  return (sessionClaims?.metadata as Record<string, string> | undefined)?.tenantId ?? null
}

export async function GET() {
  try {
    const { userId, sessionClaims } = await auth()
    if (!userId) return unauthorized()
    const tenantId = getTenantId(sessionClaims as Record<string, unknown>)
    if (!tenantId) return unauthorized('Not a tenant account')

    const payments = await prisma.rentPayment.findMany({
      where: { tenantId },
      include: { lease: { include: { unit: true } } },
      orderBy: { dueDate: 'desc' },
    })

    return ok(payments)
  } catch {
    return serverError('Failed to fetch payments')
  }
}

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

// Marks a connection as ACTIVE again after a transient error.
// For token re-issuance use /reauth instead.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params

    const connection = await prisma.bankConnection.findFirst({
      where: { id, userId },
    })
    if (!connection) return notFound('Connection not found')

    await prisma.bankConnection.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        disconnectReason: null,
        errorCount: 0,
      },
    })

    return ok({ reactivated: true })
  } catch (err) {
    console.error('[connections/reactivate]', err)
    return serverError('Failed to reactivate connection')
  }
}

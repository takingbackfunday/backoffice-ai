import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params

    const connection = await prisma.bankConnection.findFirst({
      where: { id, userId },
      include: {
        account: { include: { institution: true } },
        syncJobs: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!connection) return notFound('Connection not found')
    return ok(connection)
  } catch {
    return serverError('Failed to fetch connection')
  }
}

export async function DELETE(
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

    await prisma.$transaction(async (tx) => {
      await tx.syncJob.deleteMany({ where: { bankConnectionId: id } })
      await tx.bankConnection.delete({ where: { id } })
    })

    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete connection')
  }
}

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { logger } from '@/lib/log'

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId') ?? undefined

    const receipts = await prisma.receipt.findMany({
      where: { userId, ...(workspaceId ? { workspaceId } : {}) },
      include: {
        transaction: {
          select: {
            id: true,
            date: true,
            amount: true,
            description: true,
            category: true,
          },
        },
        workspace: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(receipts)
  } catch (err) {
    logger.error('receipts', 'GET error', { message: err instanceof Error ? err.message : String(err) })
    return serverError()
  }
}

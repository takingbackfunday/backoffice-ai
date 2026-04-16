import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'

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
    console.error('[/api/receipts GET]', err)
    return serverError()
  }
}

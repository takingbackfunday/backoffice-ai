import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const receipts = await prisma.receipt.findMany({
      where: { userId },
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
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(receipts)
  } catch (err) {
    console.error('[/api/receipts GET]', err)
    return serverError()
  }
}

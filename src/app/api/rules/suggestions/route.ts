import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const suggestions = await prisma.ruleSuggestion.findMany({
      where: { userId, status: 'PENDING' },
      include: {
        categoryRef: { include: { group: true } },
        payee: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(suggestions)
  } catch {
    return serverError('Failed to fetch suggestions')
  }
}

// Bulk ignore all pending suggestions
export async function DELETE() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { count } = await prisma.ruleSuggestion.updateMany({
      where: { userId, status: 'PENDING' },
      data: { status: 'IGNORED' },
    })

    return ok({ ignored: count })
  } catch {
    return serverError('Failed to ignore suggestions')
  }
}

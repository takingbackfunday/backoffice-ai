import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string }> }

// GET — list positive, unlinked transactions for a project (for the "Link transaction" picker)
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    // Verify the project belongs to this user
    const project = await prisma.workspace.findFirst({ where: { id, userId } })
    if (!project) return notFound('Project not found')

    const transactions = await prisma.transaction.findMany({
      where: {
        workspaceId: id,
        amount: { gt: 0 },
        invoicePayment: null,
        bill: null,
      },
      select: { id: true, description: true, date: true, amount: true },
      orderBy: { date: 'desc' },
      take: 50,
    })

    return ok(transactions)
  } catch {
    return serverError('Failed to fetch transactions')
  }
}

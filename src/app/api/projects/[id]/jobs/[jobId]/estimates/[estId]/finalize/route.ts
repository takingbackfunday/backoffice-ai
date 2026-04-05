import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; jobId: string; estId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId, estId } = await params

    const estimate = await prisma.estimate.findFirst({
      where: {
        id: estId,
        jobId,
        job: { clientProfile: { workspace: { id, userId } } },
      },
    })
    if (!estimate) return notFound('Estimate not found')
    if (estimate.status === 'FINAL') return badRequest('Estimate is already finalized')

    const updated = await prisma.estimate.update({
      where: { id: estId },
      data: { status: 'FINAL' },
    })

    return ok(JSON.parse(JSON.stringify(updated)))
  } catch (e) {
    console.error('[estimate finalize]', e)
    return serverError()
  }
}

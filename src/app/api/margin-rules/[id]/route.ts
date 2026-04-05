import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const rule = await prisma.marginRule.findFirst({ where: { id, userId } })
    if (!rule) return notFound('Margin rule not found')

    await prisma.marginRule.delete({ where: { id } })
    return ok({ id })
  } catch (e) {
    console.error('[margin-rules DELETE]', e)
    return serverError()
  }
}

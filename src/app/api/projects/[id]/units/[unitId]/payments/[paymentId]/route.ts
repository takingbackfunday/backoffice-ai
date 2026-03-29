import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const VoidSchema = z.object({
  action: z.literal('void'),
  reason: z.string().max(500).optional().nullable(),
})

const RestoreSchema = z.object({
  action: z.literal('restore'),
})

const PatchSchema = z.discriminatedUnion('action', [VoidSchema, RestoreSchema])

interface RouteParams { params: Promise<{ id: string; unitId: string; paymentId: string }> }

async function resolvePayment(projectId: string, unitId: string, paymentId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, type: 'PROPERTY' },
    include: { propertyProfile: { select: { units: { where: { id: unitId }, select: { id: true } } } } },
  })
  if (!project?.propertyProfile?.units[0]) return null

  const payment = await prisma.tenantPayment.findFirst({
    where: { id: paymentId, lease: { unitId } },
  })
  return payment
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId, paymentId } = await params

    const payment = await resolvePayment(id, unitId, paymentId, userId)
    if (!payment) return notFound('Payment not found')

    const body = await request.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    if (parsed.data.action === 'void') {
      if (payment.voidedAt) return badRequest('Payment is already voided')
      const updated = await prisma.tenantPayment.update({
        where: { id: paymentId },
        data: {
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason: parsed.data.reason?.trim() ?? null,
        },
      })
      return ok(updated)
    }

    // restore — un-void
    if (!payment.voidedAt) return badRequest('Payment is not voided')
    const updated = await prisma.tenantPayment.update({
      where: { id: paymentId },
      data: { voidedAt: null, voidedBy: null, voidReason: null },
    })
    return ok(updated)
  } catch {
    return serverError('Failed to update payment')
  }
}

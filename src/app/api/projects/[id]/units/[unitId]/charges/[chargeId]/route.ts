import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const ForgivePatchSchema = z.object({
  action: z.literal('forgive'),
  reason: z.string().max(500).optional().nullable(),
})

const UnforgivePatchSchema = z.object({
  action: z.literal('unforgive'),
})

const PatchSchema = z.discriminatedUnion('action', [ForgivePatchSchema, UnforgivePatchSchema])

interface RouteParams { params: Promise<{ id: string; unitId: string; chargeId: string }> }

async function resolveCharge(projectId: string, unitId: string, chargeId: string, userId: string) {
  // Verify ownership: project → propertyProfile → unit → lease → charge
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, type: 'PROPERTY' },
    include: { propertyProfile: { select: { units: { where: { id: unitId }, select: { id: true } } } } },
  })
  if (!project?.propertyProfile?.units[0]) return null

  const charge = await prisma.tenantCharge.findFirst({
    where: { id: chargeId, lease: { unitId } },
  })
  return charge
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId, chargeId } = await params

    const charge = await resolveCharge(id, unitId, chargeId, userId)
    if (!charge) return notFound('Charge not found')

    const body = await request.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    if (parsed.data.action === 'forgive') {
      if (charge.forgivenAt) return badRequest('Charge is already forgiven')
      const updated = await prisma.tenantCharge.update({
        where: { id: chargeId },
        data: {
          forgivenAt: new Date(),
          forgivenBy: userId,
          forgivenReason: parsed.data.reason?.trim() ?? null,
        },
      })
      return ok(updated)
    }

    // unforgive — restore the charge to active
    if (!charge.forgivenAt) return badRequest('Charge is not forgiven')
    const updated = await prisma.tenantCharge.update({
      where: { id: chargeId },
      data: { forgivenAt: null, forgivenBy: null, forgivenReason: null },
    })
    return ok(updated)
  } catch {
    return serverError('Failed to update charge')
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId, chargeId } = await params

    const charge = await resolveCharge(id, unitId, chargeId, userId)
    if (!charge) return notFound('Charge not found')

    // Only allow deleting charges that have never been forgiven and are not RENT
    // (RENT charges are system-generated and should be forgiven, not deleted)
    if (charge.type === 'RENT') return badRequest('Rent charges cannot be deleted — use forgive instead')

    await prisma.tenantCharge.delete({ where: { id: chargeId } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete charge')
  }
}

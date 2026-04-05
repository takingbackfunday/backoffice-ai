import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateShowingSchema = z.object({
  scheduledAt: z.string().optional(),
  durationMin: z.number().int().optional(),
  status: z.enum(['PROPOSED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  notes: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; showingId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, showingId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const existing = await prisma.showing.findFirst({
      where: { id: showingId, unitId: { in: unitIds } },
      include: {
        applicant: { select: { id: true, listingId: true } },
      },
    })
    if (!existing) return notFound('Showing not found')

    const body = await request.json()
    const parsed = UpdateShowingSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const updateData: Record<string, unknown> = {}
    if (parsed.data.scheduledAt) updateData.scheduledAt = new Date(parsed.data.scheduledAt)
    if (parsed.data.durationMin !== undefined) updateData.durationMin = parsed.data.durationMin
    if (parsed.data.status) updateData.status = parsed.data.status
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes

    const showing = await prisma.showing.update({
      where: { id: showingId },
      data: updateData,
      include: {
        applicant: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, unitLabel: true } },
      },
    })

    return ok(showing)
  } catch {
    return serverError('Failed to update showing')
  }
}

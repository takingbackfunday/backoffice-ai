import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpsertPropertyProfileSchema = z.object({
  address: z.string().min(1, 'Property address is required'),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  propertyType: z.enum(['RESIDENTIAL', 'MULTI_FAMILY', 'COMMERCIAL', 'MIXED_USE', 'LAND']).optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const workspace = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!workspace) return notFound('Property not found')

    // Already has a profile — update it instead of creating a duplicate
    if (workspace.propertyProfile) {
      const body = await request.json()
      const parsed = UpsertPropertyProfileSchema.safeParse(body)
      if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

      const updated = await prisma.propertyProfile.update({
        where: { id: workspace.propertyProfile.id },
        data: parsed.data,
      })
      return ok(updated)
    }

    const body = await request.json()
    const parsed = UpsertPropertyProfileSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const profile = await prisma.propertyProfile.create({
      data: {
        workspaceId: id,
        address: parsed.data.address,
        city: parsed.data.city,
        state: parsed.data.state,
        zipCode: parsed.data.zipCode,
        country: parsed.data.country ?? 'US',
        propertyType: parsed.data.propertyType ?? 'RESIDENTIAL',
      },
    })

    return ok(profile)
  } catch (err) {
    console.error('[POST /api/projects/[id]/property-profile]', err)
    return serverError('Failed to save property details')
  }
}

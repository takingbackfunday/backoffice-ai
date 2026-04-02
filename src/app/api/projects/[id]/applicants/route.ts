import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateApplicantSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  unitId: z.string().optional(),
  source: z.string().optional(),
  desiredMoveIn: z.string().optional(),
  desiredRent: z.number().optional(),
  notes: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const unitId = searchParams.get('unitId') ?? undefined

    const statusFilter = statusParam
      ? statusParam.split(',').map(s => s.trim()).filter(Boolean)
      : undefined

    const applicants = await prisma.applicant.findMany({
      where: {
        propertyProfileId: project.propertyProfile.id,
        ...(statusFilter ? { status: { in: statusFilter as never[] } } : {}),
        ...(unitId ? { unitId } : {}),
      },
      include: {
        unit: { select: { id: true, unitLabel: true } },
        _count: { select: { documents: true } },
        convertedToTenant: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(applicants, { count: applicants.length })
  } catch {
    return serverError('Failed to fetch applicants')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const body = await request.json()
    const parsed = CreateApplicantSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    // Validate unitId belongs to this property if provided
    if (parsed.data.unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: parsed.data.unitId, propertyProfileId: project.propertyProfile.id },
      })
      if (!unit) return badRequest('Unit does not belong to this property')
    }

    const applicant = await prisma.applicant.create({
      data: {
        userId,
        propertyProfileId: project.propertyProfile.id,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        unitId: parsed.data.unitId,
        source: parsed.data.source,
        desiredMoveIn: parsed.data.desiredMoveIn ? new Date(parsed.data.desiredMoveIn) : undefined,
        desiredRent: parsed.data.desiredRent,
        notes: parsed.data.notes,
      },
      include: {
        unit: { select: { id: true, unitLabel: true } },
        _count: { select: { documents: true } },
      },
    })

    return created(applicant)
  } catch {
    return serverError('Failed to create applicant')
  }
}

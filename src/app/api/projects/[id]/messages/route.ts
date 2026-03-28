import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { sendTenantMessageNotification } from '@/lib/email'

const CreateMessageSchema = z.object({
  tenantId: z.string().min(1),
  unitId: z.string().min(1),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Message body is required'),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId')
    const unitId = searchParams.get('unitId')

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const where: Record<string, unknown> = { unitId: { in: unitIds } }
    if (tenantId) where.tenantId = tenantId
    if (unitId && unitIds.includes(unitId)) where.unitId = unitId

    const messages = await prisma.message.findMany({
      where,
      include: { tenant: true, unit: true },
      orderBy: { createdAt: 'asc' },
    })

    return ok(messages, { count: messages.length })
  } catch {
    return serverError('Failed to fetch messages')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const body = await request.json()
    const parsed = CreateMessageSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const unitIds = project.propertyProfile.units.map(u => u.id)
    if (!unitIds.includes(parsed.data.unitId)) {
      return badRequest('Unit does not belong to this property')
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: parsed.data.tenantId },
      select: { email: true, name: true },
    })

    const message = await prisma.message.create({
      data: {
        tenantId: parsed.data.tenantId,
        unitId: parsed.data.unitId,
        senderRole: 'owner',
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
      include: { tenant: true, unit: true },
    })

    // Send email notification to tenant (fire-and-forget)
    if (tenant) {
      sendTenantMessageNotification({
        toEmail: tenant.email,
        toName: tenant.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
        senderName: 'Your landlord',
      }).catch(() => {})
    }

    return created(message)
  } catch {
    return serverError('Failed to send message')
  }
}

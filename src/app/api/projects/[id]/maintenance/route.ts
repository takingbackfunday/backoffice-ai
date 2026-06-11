import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace } from '@/lib/authz'
import type { Prisma } from '@/generated/prisma/client'

const ParamsSchema = z.object({ id: z.string() })

type PropertyWorkspace = Prisma.WorkspaceGetPayload<{
  include: { propertyProfile: { include: { units: { select: { id: true } } } } }
}>

const CreateMaintenanceSchema = z.object({
  unitId: z.string().min(1, 'Unit is required'),
  tenantId: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
})

export const GET = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const project = await requireWorkspace(userId, params.id, {
      propertyProfile: { include: { units: { select: { id: true } } } },
    }) as PropertyWorkspace
    if (!project.propertyProfile) return badRequest('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const requests = await prisma.maintenanceRequest.findMany({
      where: { unitId: { in: unitIds } },
      include: { unit: true, tenant: true },
      orderBy: { createdAt: 'desc' },
    })
    return ok(requests, { count: requests.length })
  },
})

export const POST = authedRoute<{ id: string }, z.infer<typeof CreateMaintenanceSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreateMaintenanceSchema,
  handler: async ({ userId, params, body }) => {
    const project = await requireWorkspace(userId, params.id, {
      propertyProfile: { include: { units: { select: { id: true } } } },
    }) as PropertyWorkspace
    if (!project.propertyProfile) return badRequest('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    if (!unitIds.includes(body.unitId)) {
      return badRequest('Unit does not belong to this property')
    }

    const req = await prisma.maintenanceRequest.create({
      data: {
        unitId: body.unitId,
        tenantId: body.tenantId,
        title: body.title,
        description: body.description,
        priority: body.priority ?? 'MEDIUM',
      },
      include: { unit: true, tenant: true },
    })
    return created(req)
  },
})

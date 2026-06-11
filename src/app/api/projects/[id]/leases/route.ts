import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace, requireTenant } from '@/lib/authz'
import type { Prisma } from '@/generated/prisma/client'

const ParamsSchema = z.object({ id: z.string() })

type PropertyWorkspace = Prisma.WorkspaceGetPayload<{
  include: { propertyProfile: { include: { units: { select: { id: true } } } } }
}>

const CreateLeaseSchema = z.object({
  unitId: z.string().min(1, 'Unit is required'),
  tenantId: z.string().min(1, 'Tenant is required'),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH', 'TERMINATED', 'EXPIRED']).optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  monthlyRent: z.number().min(0, 'Monthly rent is required'),
  securityDeposit: z.number().optional(),
  paymentDueDay: z.number().int().min(1).max(28).optional(),
  lateFeeAmount: z.number().optional(),
  lateFeeGraceDays: z.number().int().optional(),
  currency: z.string().length(3).optional(),
  contractNotes: z.string().optional(),
})

export const GET = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const project = await requireWorkspace(userId, params.id, {
      propertyProfile: { include: { units: { select: { id: true } } } },
    }) as PropertyWorkspace
    if (!project.propertyProfile) return badRequest('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const leases = await prisma.lease.findMany({
      where: { unitId: { in: unitIds } },
      include: {
        unit: true,
        tenant: true,
        _count: { select: { invoices: true } },
      },
      orderBy: { startDate: 'desc' },
    })
    return ok(leases, { count: leases.length })
  },
})

export const POST = authedRoute<{ id: string }, z.infer<typeof CreateLeaseSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreateLeaseSchema,
  handler: async ({ userId, params, body }) => {
    const project = await requireWorkspace(userId, params.id, {
      propertyProfile: { include: { units: { select: { id: true } } } },
    }) as PropertyWorkspace
    if (!project.propertyProfile) return badRequest('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    if (!unitIds.includes(body.unitId)) {
      return badRequest('Unit does not belong to this property')
    }

    await requireTenant(userId, body.tenantId)

    const lease = await prisma.lease.create({
      data: {
        unitId: body.unitId,
        tenantId: body.tenantId,
        status: body.status ?? 'ACTIVE',
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        monthlyRent: body.monthlyRent,
        securityDeposit: body.securityDeposit,
        paymentDueDay: body.paymentDueDay ?? 1,
        lateFeeAmount: body.lateFeeAmount,
        lateFeeGraceDays: body.lateFeeGraceDays ?? 5,
        currency: body.currency ?? 'USD',
        contractNotes: body.contractNotes,
      },
      include: { unit: true, tenant: true },
    })

    await prisma.unit.update({
      where: { id: body.unitId },
      data: { status: 'LEASED' },
    })

    return created(lease)
  },
})

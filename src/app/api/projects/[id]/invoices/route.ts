import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace } from '@/lib/authz'
import { parsePreferences } from '@/types/preferences'
import type { Prisma } from '@/generated/prisma/client'

const ParamsSchema = z.object({ id: z.string() })

type WorkspaceWithProfiles = Prisma.WorkspaceGetPayload<{
  include: {
    clientProfile: true
    propertyProfile: { include: { units: { select: { id: true } } } }
  }
}>

const LineItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().positive('Quantity must be positive'),
  qtyUnit: z.string().optional(),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  isTaxLine: z.boolean().default(false),
  chargeType: z.string().optional(),
  maintenanceRequestId: z.string().optional(),
})

const CreateInvoiceSchema = z.object({
  jobId: z.string().optional(),
  leaseId: z.string().optional(),
  tenantId: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  appendToCurrentDraft: z.boolean().default(false),
  dueDate: z.string().min(1, 'Due date is required'),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
  lineItems: z.array(LineItemSchema).min(1, 'At least one line item is required'),
  quoteId: z.string().optional(),
})

const invoiceInclude = {
  job: { select: { id: true, name: true } },
  lineItems: true,
  payments: true,
}

const propertyInvoiceInclude = {
  lease: { select: { id: true, unit: { select: { unitLabel: true } } } },
  tenant: { select: { id: true, name: true, email: true } },
  lineItems: true,
  payments: true,
}

export const GET = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const project = await requireWorkspace(userId, params.id, {
      clientProfile: true,
      propertyProfile: { include: { units: { select: { id: true } } } },
    }) as WorkspaceWithProfiles

    if (project.type === 'CLIENT') {
      if (!project.clientProfile) return badRequest('Client project not found')
      const invoices = await prisma.invoice.findMany({
        where: { clientProfileId: project.clientProfile.id },
        include: invoiceInclude,
        orderBy: { createdAt: 'desc' },
      })
      return ok(invoices, { count: invoices.length })
    }

    if (project.type === 'PROPERTY') {
      if (!project.propertyProfile) return badRequest('Property project not found')
      const unitIds = project.propertyProfile.units.map(u => u.id)
      const invoices = await prisma.invoice.findMany({
        where: {
          OR: [
            { lease: { unitId: { in: unitIds } } },
            { tenant: { userId, leases: { some: { unitId: { in: unitIds } } } } },
          ],
        },
        include: propertyInvoiceInclude,
        orderBy: { createdAt: 'desc' },
      })
      return ok(invoices, { count: invoices.length })
    }

    return badRequest('Project type not supported')
  },
})

export const POST = authedRoute<{ id: string }, z.infer<typeof CreateInvoiceSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreateInvoiceSchema,
  handler: async ({ userId, params, body }) => {
    const project = await requireWorkspace(userId, params.id, {
      clientProfile: true,
      propertyProfile: { include: { units: { select: { id: true } } } },
    }) as WorkspaceWithProfiles

    if (project.type === 'CLIENT') {
      if (!project.clientProfile) return badRequest('Client project not found')

      if (body.jobId) {
        const job = await prisma.job.findFirst({
          where: { id: body.jobId, clientProfileId: project.clientProfile.id },
        })
        if (!job) return badRequest('Job not found for this client')
      }

      const userInvoiceCount = await prisma.invoice.count({
        where: { clientProfile: { workspace: { userId } } },
      })
      const prefs = await prisma.userPreference.findUnique({ where: { userId } })
      const prefsData = parsePreferences(prefs?.data)
      const nameForInitials = prefsData.businessName || prefsData.yourName || ''
      const initials = nameForInitials
        ? nameForInitials.trim().split(/\s+/).map((w: string) => w[0].toUpperCase()).join('')
        : 'INV'
      const today = new Date()
      const datePart = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`
      const invoiceNumber = `${initials}_${datePart}_${String(userInvoiceCount + 1).padStart(2, '0')}`

      const invoice = await prisma.invoice.create({
        data: {
          clientProfileId: project.clientProfile.id,
          jobId: body.jobId ?? null,
          quoteId: body.quoteId ?? null,
          invoiceNumber,
          dueDate: new Date(body.dueDate),
          currency: body.currency,
          notes: body.notes,
          lineItems: {
            create: body.lineItems.map(item => ({
              description: item.description,
              quantity: item.quantity,
              qtyUnit: item.qtyUnit ?? null,
              unitPrice: item.unitPrice,
              isTaxLine: item.isTaxLine,
              chargeType: item.chargeType ?? null,
            })),
          },
        },
        include: invoiceInclude,
      })
      return created(invoice)
    }

    if (project.type === 'PROPERTY') {
      if (!project.propertyProfile) return badRequest('Property project not found')
      const unitIds = project.propertyProfile.units.map(u => u.id)

      if (body.leaseId) {
        const lease = await prisma.lease.findFirst({
          where: { id: body.leaseId, unitId: { in: unitIds } },
        })
        if (!lease) return badRequest('Lease not found on this property')
      }

      if (body.tenantId) {
        const tenant = await prisma.tenant.findFirst({
          where: { id: body.tenantId, userId },
        })
        if (!tenant) return badRequest('Tenant not found')
      }

      if (!body.leaseId && !body.tenantId) {
        return badRequest('Either leaseId or tenantId is required for property invoices')
      }

      if (body.appendToCurrentDraft && body.leaseId && body.period) {
        const existingDraft = await prisma.invoice.findFirst({
          where: {
            leaseId: body.leaseId,
            period: body.period,
            status: 'DRAFT',
          },
          include: propertyInvoiceInclude,
        })
        if (existingDraft) {
          await prisma.invoiceLineItem.createMany({
            data: body.lineItems.map(li => ({
              invoiceId: existingDraft.id,
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              isTaxLine: false,
              chargeType: li.chargeType ?? null,
              maintenanceRequestId: li.maintenanceRequestId ?? null,
            })),
          })
          const updated = await prisma.invoice.findUnique({
            where: { id: existingDraft.id },
            include: propertyInvoiceInclude,
          })
          return ok(updated!)
        }
      }

      const propertyInvoiceCount = await prisma.invoice.count({
        where: { lease: { unitId: { in: unitIds } } },
      })
      const invoiceNumber = `RENT-${String(propertyInvoiceCount + 1).padStart(4, '0')}`

      const invoice = await prisma.invoice.create({
        data: {
          leaseId: body.leaseId ?? null,
          tenantId: body.tenantId ?? null,
          invoiceNumber,
          period: body.period ?? null,
          dueDate: new Date(body.dueDate),
          currency: body.currency,
          notes: body.notes,
          lineItems: {
            create: body.lineItems.map(item => ({
              description: item.description,
              quantity: item.quantity,
              qtyUnit: item.qtyUnit ?? null,
              unitPrice: item.unitPrice,
              isTaxLine: item.isTaxLine,
              chargeType: item.chargeType ?? null,
              maintenanceRequestId: item.maintenanceRequestId ?? null,
            })),
          },
        },
        include: propertyInvoiceInclude,
      })
      return created(invoice)
    }

    return badRequest('Project type not supported')
  },
})

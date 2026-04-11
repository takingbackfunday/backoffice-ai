import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

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
  // CLIENT fields
  jobId: z.string().optional(),
  // PROPERTY fields
  leaseId: z.string().optional(),
  tenantId: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  appendToCurrentDraft: z.boolean().default(false),
  // shared
  dueDate: z.string().min(1, 'Due date is required'),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
  lineItems: z.array(LineItemSchema).min(1, 'At least one line item is required'),
  // quote fulfillment link (optional)
  quoteId: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    // Look up project regardless of type — then branch
    const project = await prisma.workspace.findFirst({
      where: { id, userId },
      include: {
        clientProfile: true,
        propertyProfile: { include: { units: { select: { id: true } } } },
      },
    })
    if (!project) return notFound('Project not found')

    if (project.type === 'CLIENT') {
      if (!project.clientProfile) return notFound('Client project not found')
      const invoices = await prisma.invoice.findMany({
        where: { clientProfileId: project.clientProfile.id },
        include: {
          job: { select: { id: true, name: true } },
          lineItems: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      return ok(invoices, { count: invoices.length })
    }

    if (project.type === 'PROPERTY') {
      if (!project.propertyProfile) return notFound('Property project not found')
      const unitIds = project.propertyProfile.units.map(u => u.id)
      // Invoices linked to leases on this property's units, or directly to tenants via this project
      const invoices = await prisma.invoice.findMany({
        where: {
          OR: [
            { lease: { unitId: { in: unitIds } } },
            { tenant: { userId, leases: { some: { unitId: { in: unitIds } } } } },
          ],
        },
        include: {
          lease: { select: { id: true, unit: { select: { unitLabel: true } } } },
          tenant: { select: { id: true, name: true, email: true } },
          lineItems: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      return ok(invoices, { count: invoices.length })
    }

    return notFound('Project type not supported')
  } catch {
    return serverError('Failed to fetch invoices')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId },
      include: {
        clientProfile: true,
        propertyProfile: { include: { units: { select: { id: true } } } },
      },
    })
    if (!project) return notFound('Project not found')

    const body = await request.json()
    const parsed = CreateInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    if (project.type === 'CLIENT') {
      if (!project.clientProfile) return notFound('Client project not found')

      if (parsed.data.jobId) {
        const job = await prisma.job.findFirst({
          where: { id: parsed.data.jobId, clientProfileId: project.clientProfile.id },
        })
        if (!job) return badRequest('Job not found for this client')
      }

      const userInvoiceCount = await prisma.invoice.count({
        where: { clientProfile: { workspace: { userId } } },
      })
      const prefs = await prisma.userPreference.findUnique({ where: { userId } })
      const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
      const nameForInitials = (prefsData.businessName as string) || (prefsData.yourName as string) || ''
      const initials = nameForInitials
        ? nameForInitials.trim().split(/\s+/).map((w: string) => w[0].toUpperCase()).join('')
        : 'INV'
      const today = new Date()
      const datePart = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`
      const invoiceNumber = `${initials}_${datePart}_${String(userInvoiceCount + 1).padStart(2, '0')}`

      const invoice = await prisma.invoice.create({
        data: {
          clientProfileId: project.clientProfile.id,
          jobId: parsed.data.jobId ?? null,
          quoteId: parsed.data.quoteId ?? null,
          invoiceNumber,
          dueDate: new Date(parsed.data.dueDate),
          currency: parsed.data.currency,
          notes: parsed.data.notes,
          lineItems: {
            create: parsed.data.lineItems.map(item => ({
              description: item.description,
              quantity: item.quantity,
              qtyUnit: item.qtyUnit ?? null,
              unitPrice: item.unitPrice,
              isTaxLine: item.isTaxLine,
              chargeType: item.chargeType ?? null,
            })),
          },
        },
        include: {
          job: { select: { id: true, name: true } },
          lineItems: true,
          payments: true,
        },
      })
      return created(invoice)
    }

    if (project.type === 'PROPERTY') {
      if (!project.propertyProfile) return notFound('Property project not found')

      // Validate leaseId or tenantId
      const unitIds = project.propertyProfile.units.map(u => u.id)

      if (parsed.data.leaseId) {
        const lease = await prisma.lease.findFirst({
          where: { id: parsed.data.leaseId, unitId: { in: unitIds } },
        })
        if (!lease) return badRequest('Lease not found on this property')
      }

      if (parsed.data.tenantId) {
        const tenant = await prisma.tenant.findFirst({
          where: { id: parsed.data.tenantId, userId },
        })
        if (!tenant) return badRequest('Tenant not found')
      }

      if (!parsed.data.leaseId && !parsed.data.tenantId) {
        return badRequest('Either leaseId or tenantId is required for property invoices')
      }

      // If appendToCurrentDraft: find an existing DRAFT for this (leaseId, period) and append
      if (parsed.data.appendToCurrentDraft && parsed.data.leaseId && parsed.data.period) {
        const existingDraft = await prisma.invoice.findFirst({
          where: {
            leaseId: parsed.data.leaseId,
            period: parsed.data.period,
            status: 'DRAFT',
          },
          include: {
            lease: { select: { id: true, unit: { select: { unitLabel: true } } } },
            tenant: { select: { id: true, name: true, email: true } },
            lineItems: true,
            payments: true,
          },
        })
        if (existingDraft) {
          await prisma.invoiceLineItem.createMany({
            data: parsed.data.lineItems.map(li => ({
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
            include: {
              lease: { select: { id: true, unit: { select: { unitLabel: true } } } },
              tenant: { select: { id: true, name: true, email: true } },
              lineItems: true,
              payments: true,
            },
          })
          return ok(updated!)
        }
        // No draft exists — fall through to create a new invoice
      }

      // RENT- prefix for property invoices
      const propertyInvoiceCount = await prisma.invoice.count({
        where: { lease: { unitId: { in: unitIds } } },
      })
      const invoiceNumber = `RENT-${String(propertyInvoiceCount + 1).padStart(4, '0')}`

      const invoice = await prisma.invoice.create({
        data: {
          leaseId: parsed.data.leaseId ?? null,
          tenantId: parsed.data.tenantId ?? null,
          invoiceNumber,
          period: parsed.data.period ?? null,
          dueDate: new Date(parsed.data.dueDate),
          currency: parsed.data.currency,
          notes: parsed.data.notes,
          lineItems: {
            create: parsed.data.lineItems.map(item => ({
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
        include: {
          lease: { select: { id: true, unit: { select: { unitLabel: true } } } },
          tenant: { select: { id: true, name: true, email: true } },
          lineItems: true,
          payments: true,
        },
      })

      return created(invoice)
    }

    return badRequest('Project type not supported')
  } catch {
    return serverError('Failed to create invoice')
  }
}

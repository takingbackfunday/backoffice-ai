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
  tenantChargeId: z.string().optional(), // link this line item to a TenantCharge row
})

const CreateInvoiceSchema = z.object({
  // CLIENT fields
  jobId: z.string().optional(),
  // PROPERTY fields
  leaseId: z.string().optional(),
  tenantId: z.string().optional(),
  // shared
  dueDate: z.string().min(1, 'Due date is required'),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
  lineItems: z.array(LineItemSchema).min(1, 'At least one line item is required'),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    // Look up project regardless of type — then branch
    const project = await prisma.project.findFirst({
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

    const project = await prisma.project.findFirst({
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
        where: { clientProfile: { project: { userId } } },
      })
      const invoiceNumber = `INV-${String(userInvoiceCount + 1).padStart(4, '0')}`

      const invoice = await prisma.invoice.create({
        data: {
          clientProfileId: project.clientProfile.id,
          jobId: parsed.data.jobId ?? null,
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
          lease: { select: { id: true, unit: { select: { unitLabel: true } } } },
          tenant: { select: { id: true, name: true, email: true } },
          lineItems: true,
          payments: true,
        },
      })

      // Link TenantCharge rows to their corresponding invoice line items
      const chargeLinks = parsed.data.lineItems
        .map((item, idx) => ({ tenantChargeId: item.tenantChargeId, lineItem: invoice.lineItems[idx] }))
        .filter(l => l.tenantChargeId && l.lineItem)
      if (chargeLinks.length > 0) {
        await Promise.all(chargeLinks.map(l =>
          prisma.tenantCharge.update({
            where: { id: l.tenantChargeId! },
            data: { invoiceLineItemId: l.lineItem!.id },
          })
        ))
      }

      return created(invoice)
    }

    return badRequest('Project type not supported')
  } catch {
    return serverError('Failed to create invoice')
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const LineItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  isTaxLine: z.boolean().default(false),
})

const CreateInvoiceSchema = z.object({
  jobId: z.string().optional(),
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

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'CLIENT' },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Client project not found')

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
      where: { id, userId, type: 'CLIENT' },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Client project not found')

    const body = await request.json()
    const parsed = CreateInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    // Validate jobId belongs to this client if provided
    if (parsed.data.jobId) {
      const job = await prisma.job.findFirst({
        where: { id: parsed.data.jobId, clientProfileId: project.clientProfile.id },
      })
      if (!job) return badRequest('Job not found for this client')
    }

    // Auto-generate invoice number: count all invoices for this user across all clients
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
            unitPrice: item.unitPrice,
            isTaxLine: item.isTaxLine,
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
  } catch {
    return serverError('Failed to create invoice')
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
})

const PatchInvoiceSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']).optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional().nullable(),
  lineItems: z.array(LineItemSchema).min(1).optional(),
})

interface RouteParams { params: Promise<{ id: string; invoiceId: string }> }

async function getInvoiceForUser(invoiceId: string, projectId: string, userId: string) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      clientProfile: { project: { id: projectId, userId } },
    },
    include: {
      job: { select: { id: true, name: true } },
      lineItems: true,
      payments: true,
    },
  })
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const invoice = await getInvoiceForUser(invoiceId, id, userId)
    if (!invoice) return notFound('Invoice not found')

    return ok(invoice)
  } catch {
    return serverError('Failed to fetch invoice')
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const invoice = await getInvoiceForUser(invoiceId, id, userId)
    if (!invoice) return notFound('Invoice not found')
    if (invoice.status === 'VOID') return badRequest('Cannot edit a voided invoice')

    const body = await request.json()
    const parsed = PatchInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    const updated = await prisma.$transaction(async tx => {
      if (parsed.data.lineItems) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId } })
        await tx.invoiceLineItem.createMany({
          data: parsed.data.lineItems.map(item => ({
            invoiceId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        })
      }

      return tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: parsed.data.status,
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
          notes: parsed.data.notes,
        },
        include: {
          job: { select: { id: true, name: true } },
          lineItems: true,
          payments: true,
        },
      })
    })

    return ok(updated)
  } catch {
    return serverError('Failed to update invoice')
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const invoice = await getInvoiceForUser(invoiceId, id, userId)
    if (!invoice) return notFound('Invoice not found')

    // Soft void — preserve audit trail
    const voided = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID' },
    })

    return ok(voided)
  } catch {
    return serverError('Failed to void invoice')
  }
}

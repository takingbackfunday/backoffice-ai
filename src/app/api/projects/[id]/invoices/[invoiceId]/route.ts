import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireInvoice } from '@/lib/authz'

const ParamsSchema = z.object({ id: z.string(), invoiceId: z.string() })

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  qtyUnit: z.string().optional(),
  unitPrice: z.number().min(0),
  isTaxLine: z.boolean().default(false),
})

const PatchInvoiceSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']).optional(),
  jobId: z.string().optional().nullable(),
  dueDate: z.string().optional(),
  issueDate: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional().nullable(),
  lineItems: z.array(LineItemSchema).min(1).optional(),
})

const invoiceInclude = {
  job: { select: { id: true, name: true } },
  lineItems: true,
  payments: true,
}

export const GET = authedRoute<{ id: string; invoiceId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const invoice = await requireInvoice(userId, params.invoiceId, params.id)
    const full = await prisma.invoice.findUnique({ where: { id: invoice.id }, include: invoiceInclude })
    return ok(full)
  },
})

export const PATCH = authedRoute<{ id: string; invoiceId: string }, z.infer<typeof PatchInvoiceSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: PatchInvoiceSchema,
  handler: async ({ userId, params, body }) => {
    const invoice = await requireInvoice(userId, params.invoiceId, params.id)
    if (invoice.status === 'VOID') return badRequest('Cannot edit a voided invoice')

    if (invoice.status === 'PAID') {
      const updated = await prisma.invoice.update({
        where: { id: params.invoiceId },
        data: { jobId: body.jobId !== undefined ? body.jobId : undefined },
        include: invoiceInclude,
      })
      return ok(updated)
    }

    const updated = await prisma.$transaction(async tx => {
      if (body.lineItems) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: params.invoiceId } })
        await tx.invoiceLineItem.createMany({
          data: body.lineItems.map(item => ({
            invoiceId: params.invoiceId,
            description: item.description,
            quantity: item.quantity,
            qtyUnit: item.qtyUnit ?? null,
            unitPrice: item.unitPrice,
            isTaxLine: item.isTaxLine,
          })),
        })
      }

      return tx.invoice.update({
        where: { id: params.invoiceId },
        data: {
          status: body.status,
          jobId: body.jobId !== undefined ? body.jobId : undefined,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          issueDate: body.issueDate ? new Date(body.issueDate) : undefined,
          currency: body.currency,
          notes: body.notes,
        },
        include: invoiceInclude,
      })
    })

    return ok(updated)
  },
})

export const DELETE = authedRoute<{ id: string; invoiceId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const invoice = await requireInvoice(userId, params.invoiceId, params.id)

    if (invoice.status === 'DRAFT') {
      await prisma.invoice.delete({ where: { id: params.invoiceId } })
      return ok({ deleted: true })
    }

    const voided = await prisma.invoice.update({
      where: { id: params.invoiceId },
      data: { status: 'VOID' },
    })
    return ok(voided)
  },
})

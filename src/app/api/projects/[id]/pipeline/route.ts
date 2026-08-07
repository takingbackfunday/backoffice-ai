import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { ok, badRequest } from '@/lib/api-response'
import { computeInvoiceTotals, toDisplay } from '@/lib/money'

const ParamsSchema = z.object({ id: z.string() })

const VALID_ENTITIES = ['quote', 'invoice'] as const

export type PipelineEntity = (typeof VALID_ENTITIES)[number]

export type PipelineNode = {
  type: 'quote' | 'invoice' | 'invoices'
  id: string
  label: string
  status?: string
  href: string
  meta?: string
}

export const GET = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params, request }) => {
    const { id: projectId } = params
    await requireWorkspace(userId, projectId)

    const url = new URL(request.url)
    const entity = url.searchParams.get('entity') as PipelineEntity | null
    const entityId = url.searchParams.get('entityId') ?? ''

    if (!entity || !VALID_ENTITIES.includes(entity)) {
      return badRequest('entity must be one of quote, invoice')
    }
    if (!entityId) {
      return badRequest('entityId is required')
    }

    const nodes: PipelineNode[] = []

    if (entity === 'quote') {
      const quote = await prisma.quote.findFirst({
        where: { id: entityId, clientProfile: { workspaceId: projectId } },
        include: {
          job: { select: { id: true } },
          invoices: {
            where: { status: { not: 'VOID' } },
            include: { lineItems: true, payments: true },
          },
        },
      })
      if (!quote) return badRequest('Quote not found')

      nodes.push({
        type: 'quote',
        id: quote.id,
        label: `Quote ${quote.quoteNumber}`,
        status: quote.status,
        href: `/projects/${projectId}/quotes/${quote.id}`,
      })

      const invCount = quote.invoices.length
      if (invCount > 0) {
        const { totalInvoiced, totalPaid } = quote.invoices.reduce(
          (acc, inv) => {
            const { total, paid } = computeInvoiceTotals(inv)
            return {
              totalInvoiced: acc.totalInvoiced + toDisplay(total),
              totalPaid: acc.totalPaid + toDisplay(paid),
            }
          },
          { totalInvoiced: 0, totalPaid: 0 },
        )
        const meta = `${invCount} invoice${invCount !== 1 ? 's' : ''} (${fmt(totalPaid, quote.currency)} / ${fmt(totalInvoiced, quote.currency)} invoiced)`
        nodes.push({
          type: 'invoices',
          id: 'invoices',
          label: 'Invoices',
          href: `/projects/${projectId}/invoices`,
          meta,
        })
      }
    }

    if (entity === 'invoice') {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: entityId,
          OR: [
            { clientProfile: { workspaceId: projectId } },
            { lease: { unit: { propertyProfile: { workspaceId: projectId } } } },
            { tenant: { userId, leases: { some: { unit: { propertyProfile: { workspaceId: projectId } } } } } },
            { applicant: { propertyProfile: { workspaceId: projectId } } },
          ],
        },
        include: {
          quote: {
            include: {
              job: { select: { id: true } },
            },
          },
          lineItems: true,
          payments: true,
        },
      })
      if (!invoice) return badRequest('Invoice not found')

      if (invoice.quote) {
        nodes.push({
          type: 'quote',
          id: invoice.quote.id,
          label: `Quote ${invoice.quote.quoteNumber}`,
          status: invoice.quote.status,
          href: `/projects/${projectId}/quotes/${invoice.quote.id}`,
        })
      }

      const { total, paid } = computeInvoiceTotals(invoice)
      nodes.push({
        type: 'invoice',
        id: invoice.id,
        label: `Invoice ${invoice.invoiceNumber}`,
        status: invoice.status,
        href: `/projects/${projectId}/invoices/${invoice.id}`,
        meta: `${fmt(toDisplay(paid), invoice.currency)} / ${fmt(toDisplay(total), invoice.currency)}`,
      })
    }

    return ok({ nodes })
  },
})

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

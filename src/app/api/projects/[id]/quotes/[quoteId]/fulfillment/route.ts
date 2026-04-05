import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

function sumItems(items: { unitPrice: unknown; quantity: unknown }[]) {
  return items.reduce((sum, i) => sum + Number(i.unitPrice) * Number(i.quantity), 0)
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfile: { workspace: { id, userId } } },
      include: {
        sections: { include: { items: true } },
        amendments: {
          where: { status: 'ACCEPTED' },
          include: { sections: { include: { items: true } } },
        },
        invoices: {
          where: { status: { not: 'VOID' } },
          include: {
            lineItems: true,
            payments: { where: { voidedAt: null } },
          },
        },
      },
    })
    if (!quote) return notFound('Quote not found')

    const totalAgreed = quote.sections.reduce((sum, s) => sum + sumItems(s.items), 0)
    const amendmentTotal = quote.amendments.reduce(
      (sum, a) => sum + a.sections.reduce((ss, s) => ss + sumItems(s.items), 0),
      0
    )
    const effectiveTotal = totalAgreed + amendmentTotal

    const totalInvoiced = quote.invoices.reduce(
      (sum, inv) => sum + inv.lineItems
        .filter(li => !li.isTaxLine)
        .reduce((si, li) => si + Number(li.unitPrice) * Number(li.quantity), 0),
      0
    )
    const totalPaid = quote.invoices
      .flatMap(inv => inv.payments)
      .reduce((sum, p) => sum + Number(p.amount), 0)

    const uninvoicedBalance = effectiveTotal - totalInvoiced
    const totalOutstanding = totalInvoiced - totalPaid

    // Per-section breakdown
    const sections = quote.sections.map(s => ({
      name: s.name,
      agreed: sumItems(s.items),
      invoiced: 0, // Simplified — full per-section tracking would need line-item back-links
      paid: 0,
      remaining: sumItems(s.items),
    }))

    const invoicesSummary = quote.invoices.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      total: inv.lineItems
        .filter(li => !li.isTaxLine)
        .reduce((sum, li) => sum + Number(li.unitPrice) * Number(li.quantity), 0),
      paid: inv.payments.reduce((sum, p) => sum + Number(p.amount), 0),
      issuedAt: inv.issueDate.toISOString(),
    }))

    const amendmentsSummary = quote.amendments.map(a => ({
      id: a.id,
      quoteNumber: a.quoteNumber,
      total: a.sections.reduce((sum, s) => sum + sumItems(s.items), 0),
      signedAt: a.signedAt?.toISOString() ?? null,
    }))

    return ok({
      totalAgreed,
      amendmentTotal,
      effectiveTotal,
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      uninvoicedBalance,
      sections,
      invoices: invoicesSummary,
      amendments: amendmentsSummary,
    })
  } catch (e) {
    console.error('[quote fulfillment]', e)
    return serverError()
  }
}

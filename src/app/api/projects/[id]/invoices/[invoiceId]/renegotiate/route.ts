import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { parsePreferences } from '@/types/preferences'
import { computeInvoiceTotals, toDisplay } from '@/lib/money'
import { logger } from '@/lib/log'

interface RouteParams { params: Promise<{ id: string; invoiceId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, invoiceId } = await params

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, clientProfile: { workspace: { id, userId } } },
      include: {
        lineItems: true,
        payments: true,
        replacedBy: { select: { id: true, invoiceNumber: true } },
      },
    })
    if (!invoice) return notFound('Invoice not found')
    if (!['DRAFT', 'SENT', 'PARTIAL', 'OVERDUE'].includes(invoice.status)) {
      return badRequest('Only DRAFT, SENT, PARTIAL or OVERDUE invoices can be renegotiated')
    }
    if (invoice.replacedBy) {
      return badRequest(`This invoice has already been replaced by ${invoice.replacedBy.invoiceNumber}`)
    }

    const { paid: totalPaid } = computeInvoiceTotals(invoice)
    const totalPaidDisplay = toDisplay(totalPaid)

    const replacement = await prisma.$transaction(async tx => {
      // 1. Void the original
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'VOID' } })

      // 2. Generate next invoice number
      const count = await tx.invoice.count({
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
      const invoiceNumber = `${initials}_${datePart}_${String(count + 1).padStart(2, '0')}`

      // 3. Build line items: credit first (if partial paid), then original lines
      const creditLines = totalPaidDisplay > 0
        ? [{ description: `Less: payment received (ref ${invoice.invoiceNumber})`, quantity: 1, unitPrice: -totalPaidDisplay, isTaxLine: false }]
        : []

      const copiedLines = invoice.lineItems.map(i => ({
        description: i.description,
        quantity: toDisplay(i.quantity),
        unitPrice: toDisplay(i.unitPrice),
        isTaxLine: i.isTaxLine,
      }))

      // 4. Create replacement draft
      return tx.invoice.create({
        data: {
          clientProfileId: invoice.clientProfileId,
          jobId: invoice.jobId,
          invoiceNumber,
          status: 'DRAFT',
          dueDate: invoice.dueDate,
          currency: invoice.currency,
          notes: invoice.notes,
          replacesInvoiceId: invoiceId,
          lineItems: {
            create: [...creditLines, ...copiedLines],
          },
        },
        include: {
          lineItems: true,
          payments: true,
          job: { select: { id: true, name: true } },
        },
      })
    })

    return ok(replacement)
  } catch (err) {
    logger.error('invoice-renegotiate', 'POST error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to renegotiate invoice')
  }
}

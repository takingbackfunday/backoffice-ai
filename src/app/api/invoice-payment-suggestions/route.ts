import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const ReviewSchema = z.object({
  suggestionId: z.string().min(1),
  action: z.enum(['accept', 'dismiss']),
})

// GET — list pending suggestions; supports optional ?invoiceId=X filter
export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId') ?? undefined

    const suggestions = await prisma.invoicePaymentSuggestion.findMany({
      where: {
        userId,
        status: 'PENDING',
        ...(invoiceId ? { invoiceId } : {}),
      },
      include: {
        transaction: { select: { id: true, description: true, date: true, amount: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(suggestions, { count: suggestions.length })
  } catch {
    return serverError('Failed to fetch suggestions')
  }
}

// POST — accept or dismiss a suggestion
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = ReviewSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const { suggestionId, action } = parsed.data

    const suggestion = await prisma.invoicePaymentSuggestion.findFirst({
      where: { id: suggestionId, userId, status: 'PENDING' },
      include: {
        transaction: true,
        invoice: { include: { lineItems: true, payments: true } },
      },
    })
    if (!suggestion) return notFound('Suggestion not found')

    if (action === 'dismiss') {
      await prisma.invoicePaymentSuggestion.update({
        where: { id: suggestionId },
        data: { status: 'DISMISSED' },
      })
      return ok({ status: 'DISMISSED' })
    }

    // accept — create InvoicePayment and update invoice status
    const existingPayment = await prisma.invoicePayment.findFirst({
      where: { transactionId: suggestion.transactionId },
    })
    if (existingPayment) return badRequest('Transaction is already linked to a payment')

    await prisma.$transaction(async tx => {
      const inv = suggestion.invoice
      const txAmount = Number(suggestion.transaction.amount)

      await tx.invoicePayment.create({
        data: {
          invoiceId: inv.id,
          amount: suggestion.transaction.amount,
          paidDate: suggestion.transaction.date,
          transactionId: suggestion.transactionId,
          notes: `Matched via suggestion (${suggestion.confidence} confidence)`,
        },
      })

      // Recompute status
      const total = inv.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
      const alreadyPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const newTotalPaid = alreadyPaid + txAmount
      const newStatus = newTotalPaid >= total - 0.01 ? 'PAID' : 'PARTIAL'

      await tx.invoice.update({
        where: { id: inv.id },
        data: { status: newStatus },
      })

      await tx.invoicePaymentSuggestion.update({
        where: { id: suggestionId },
        data: { status: 'ACCEPTED' },
      })

      // Dismiss any other pending suggestions for this same transaction
      await tx.invoicePaymentSuggestion.updateMany({
        where: { transactionId: suggestion.transactionId, status: 'PENDING', id: { not: suggestionId } },
        data: { status: 'DISMISSED' },
      })
    })

    return ok({ status: 'ACCEPTED' })
  } catch {
    return serverError('Failed to review suggestion')
  }
}

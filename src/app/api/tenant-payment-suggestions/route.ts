import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const ReviewSchema = z.object({
  suggestionId: z.string().min(1),
  action: z.enum(['accept', 'dismiss']),
})

// GET — list pending suggestions for this user
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const suggestions = await prisma.tenantPaymentSuggestion.findMany({
      where: { userId, status: 'PENDING' },
      include: {
        transaction: { select: { id: true, description: true, date: true, amount: true } },
        tenant: { select: { id: true, name: true } },
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

    const suggestion = await prisma.tenantPaymentSuggestion.findFirst({
      where: { id: suggestionId, userId, status: 'PENDING' },
      include: { transaction: true },
    })
    if (!suggestion) return notFound('Suggestion not found')

    if (action === 'dismiss') {
      await prisma.tenantPaymentSuggestion.update({
        where: { id: suggestionId },
        data: { status: 'DISMISSED' },
      })
      return ok({ status: 'DISMISSED' })
    }

    // accept — create TenantPayment and mark suggestion accepted
    // Verify transaction isn't already linked
    const existingPayment = await prisma.tenantPayment.findFirst({
      where: { transactionId: suggestion.transactionId },
    })
    if (existingPayment) return badRequest('Transaction is already linked to a payment')

    await prisma.$transaction(async tx => {
      await tx.tenantPayment.create({
        data: {
          leaseId: suggestion.leaseId,
          tenantId: suggestion.tenantId,
          amount: suggestion.transaction.amount,
          paidDate: suggestion.transaction.date,
          transactionId: suggestion.transactionId,
          notes: `Auto-attributed via suggestion (${suggestion.confidence} confidence)`,
        },
      })
      await tx.tenantPaymentSuggestion.update({
        where: { id: suggestionId },
        data: { status: 'ACCEPTED' },
      })
      // Dismiss all other pending suggestions for this same transaction
      await tx.tenantPaymentSuggestion.updateMany({
        where: { transactionId: suggestion.transactionId, status: 'PENDING', id: { not: suggestionId } },
        data: { status: 'DISMISSED' },
      })
    })

    return ok({ status: 'ACCEPTED' })
  } catch {
    return serverError('Failed to review suggestion')
  }
}

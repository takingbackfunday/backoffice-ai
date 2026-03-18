import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

// Accept a suggestion → create the real CategorizationRule
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params
    const suggestion = await prisma.ruleSuggestion.findFirst({
      where: { id, userId, status: 'PENDING' },
    })
    if (!suggestion) return notFound('Suggestion not found')

    const ruleName = `${suggestion.categoryName}${suggestion.payeeName ? ` — ${suggestion.payeeName}` : ''} (suggested)`

    const [rule] = await prisma.$transaction([
      prisma.categorizationRule.create({
        data: {
          userId,
          name: ruleName,
          priority: 50,
          conditions: suggestion.conditions as object,
          categoryName: suggestion.categoryName,
          categoryId: suggestion.categoryId ?? null,
          payeeId: suggestion.payeeId ?? null,
          isActive: true,
        },
        include: {
          project: { select: { id: true, name: true } },
          categoryRef: { include: { group: true } },
          payee: true,
        },
      }),
      prisma.ruleSuggestion.update({
        where: { id },
        data: { status: 'ACCEPTED' },
      }),
    ])

    return ok(rule)
  } catch {
    return serverError('Failed to accept suggestion')
  }
}

// Ignore a single suggestion
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params
    const suggestion = await prisma.ruleSuggestion.findFirst({
      where: { id, userId, status: 'PENDING' },
    })
    if (!suggestion) return notFound('Suggestion not found')

    await prisma.ruleSuggestion.update({ where: { id }, data: { status: 'IGNORED' } })
    return ok({ ignored: true })
  } catch {
    return serverError('Failed to ignore suggestion')
  }
}

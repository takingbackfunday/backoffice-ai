import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

// Accept a suggestion → create the real CategorizationRule
// Optional body: { conditions, categoryId, categoryName, payeeId, payeeName } to override suggestion data
export async function POST(
  request: Request,
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

    // Allow caller to override any fields (user may have edited the suggestion)
    let overrides: Record<string, unknown> = {}
    try {
      const body = await request.json()
      if (body && typeof body === 'object') overrides = body
    } catch { /* no body is fine */ }

    const conditions = (overrides.conditions ?? suggestion.conditions) as object
    const categoryName = (overrides.categoryName as string | undefined) ?? suggestion.categoryName
    const categoryId = (overrides.categoryId as string | null | undefined) ?? suggestion.categoryId ?? null
    const payeeId = (overrides.payeeId as string | null | undefined) ?? suggestion.payeeId ?? null
    const payeeName = (overrides.payeeName as string | null | undefined) ?? suggestion.payeeName

    const ruleName = `${categoryName}${payeeName ? ` — ${payeeName}` : ''} (suggested)`

    const [rule] = await prisma.$transaction([
      prisma.categorizationRule.create({
        data: {
          userId,
          name: ruleName,
          priority: 50,
          conditions,
          categoryName,
          categoryId,
          payeeId,
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

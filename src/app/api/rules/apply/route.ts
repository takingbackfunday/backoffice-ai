import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { loadUserRules } from '@/lib/rules/user-rules'
import { evaluateRules } from '@/lib/rules/engine'
import type { TransactionFact } from '@/lib/rules/categorization'

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const userRules = await loadUserRules(userId)
    if (userRules.length === 0) return ok({ updated: 0, total: 0 })

    // Fetch all transactions for this user with their payee and account
    const transactions = await prisma.transaction.findMany({
      where: { account: { userId } },
      include: { account: { select: { name: true, currency: true } }, payee: { select: { name: true } } },
    })

    // Build list of patches to apply
    const patches: { id: string; data: Record<string, unknown> }[] = []

    for (const tx of transactions) {
      const fact: TransactionFact = {
        description: tx.description,
        payeeName: tx.payee?.name ?? null,
        amount: Number(tx.amount),
        currency: tx.account.currency,
        date: tx.date,
        rawDescription: tx.description,
        accountName: tx.account.name,
        notes: tx.notes,
        tags: tx.tags,
      }

      const matches = evaluateRules(fact, userRules, 'first')
      const match = matches[0] ?? null
      if (!match) continue

      const patch: Record<string, unknown> = {}
      if (match.categoryId && match.categoryId !== tx.categoryId) {
        patch.categoryId = match.categoryId
        patch.category = match.categoryName
      } else if (!match.categoryId && match.categoryName && match.categoryName !== tx.category) {
        patch.category = match.categoryName
      }
      if (match.payeeId && match.payeeId !== tx.payeeId) patch.payeeId = match.payeeId
      if (match.workspaceId && match.workspaceId !== tx.workspaceId) patch.workspaceId = match.workspaceId
      if (match.notes && match.notes !== tx.notes) patch.notes = match.notes
      if (match.addTags?.length) {
        const merged = [...new Set([...tx.tags, ...match.addTags])]
        if (merged.length !== tx.tags.length || merged.some((t) => !tx.tags.includes(t))) {
          patch.tags = merged
        }
      }

      if (Object.keys(patch).length === 0) continue
      patches.push({ id: tx.id, data: patch })
    }

    if (patches.length > 0) {
      await Promise.all(patches.map(({ id, data }) => prisma.transaction.update({ where: { id }, data })))
    }

    return ok({ updated: patches.length, total: transactions.length })
  } catch (err) {
    console.error('[/api/rules/apply]', err)
    return serverError('Failed to apply rules')
  }
}

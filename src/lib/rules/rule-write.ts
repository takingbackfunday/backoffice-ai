// Shared helpers for rule write paths (POST/PATCH /api/rules, suggestion accept).

import { prisma } from '@/lib/prisma'
import { detectRuleConflicts, type RuleConflict, type UserRuleLike } from './rule-conflicts'

/**
 * Resolve the payee for a rule write. Explicit contract (SDD-02, R3): Payee
 * rows are only ever created via POST /api/payees — rule saves resolve an
 * existing payee by id (ownership-verified) or by name (case-insensitive),
 * and reject unknown names instead of silently upserting.
 *
 * Returns `{ payeeId, payeeName }` (nulls = no payee; name is the canonical
 * DB casing) or `{ error }` with a client-safe message.
 */
export async function resolveRulePayee(
  userId: string,
  input: { payeeId?: string | null; payeeName?: string | null },
): Promise<{ payeeId: string | null; payeeName: string | null } | { error: string }> {
  const { payeeId, payeeName } = input
  if (payeeId) {
    const payee = await prisma.payee.findFirst({ where: { id: payeeId, userId } })
    if (!payee) return { error: 'Payee not found or does not belong to you' }
    return { payeeId: payee.id, payeeName: payee.name }
  }
  if (payeeName) {
    const payee = await prisma.payee.findFirst({
      where: { userId, name: { equals: payeeName, mode: 'insensitive' } },
    })
    if (!payee) {
      return { error: `Unknown payee "${payeeName}". Create it first — the payee picker has a "+ Create" option.` }
    }
    return { payeeId: payee.id, payeeName: payee.name }
  }
  return { payeeId: null, payeeName: null }
}

interface RuleRow {
  id: string
  name: string
  priority: number
  isActive: boolean
  conditions: unknown
  categoryId: string | null
  categoryName: string
  payeeId: string | null
  workspaceId: string | null
  setNotes: string | null
}

function toRuleLike(r: RuleRow): UserRuleLike {
  return {
    id: r.id,
    name: r.name,
    priority: r.priority,
    isActive: r.isActive,
    conditions: r.conditions as UserRuleLike['conditions'],
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    payeeId: r.payeeId,
    workspaceId: r.workspaceId,
    setNotes: r.setNotes,
  }
}

/**
 * Defense-in-depth conflict check for the save response: runs the same pure
 * detector the client uses and returns conflicts involving the saved rule.
 * Never blocks the write — informational only (`meta.conflicts`).
 */
export async function conflictsForSavedRule(userId: string, saved: RuleRow): Promise<RuleConflict[]> {
  const others = await prisma.categorizationRule.findMany({
    where: { userId, isActive: true, id: { not: saved.id } },
  })
  const conflicts = detectRuleConflicts([...others.map(toRuleLike), toRuleLike(saved)])
  return conflicts.filter((c) => c.ruleId === saved.id)
}

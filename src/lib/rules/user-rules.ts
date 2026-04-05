import { prisma } from '@/lib/prisma'
import type { Rule } from './engine'
import type { TransactionFact, CategorizationResult } from './categorization'
import { matchesConditions, type ConditionDef } from './evaluate-condition'

interface ConditionGroup {
  all?: ConditionDef[]
  any?: ConditionDef[]
}

// ── Condition hydration ───────────────────────────────────────────────────────

export function buildCondition(
  group: ConditionGroup
): (fact: TransactionFact) => boolean {
  return (fact: TransactionFact) => matchesConditions(group, fact)
}

// ── Public loader ─────────────────────────────────────────────────────────────

export async function loadUserRules(
  userId: string
): Promise<Rule<TransactionFact, CategorizationResult>[]> {
  const rows = await prisma.categorizationRule.findMany({
    where: { userId, isActive: true },
    orderBy: { priority: 'asc' },
  })

  return rows.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = row as any
    return {
      id: row.id,
      name: row.name,
      priority: row.priority,
      condition: buildCondition(row.conditions as ConditionGroup),
      action: () => ({
        categoryName: row.categoryName,
        categoryId: row.categoryId ?? null,
        payeeId: row.payeeId ?? null,
        workspaceId: row.workspaceId ?? null,
        notes: meta.setNotes ?? null,
        addTags: meta.addTags ?? [],
        confidence: 'high' as const,
        ruleId: row.id,
      }),
    }
  })
}

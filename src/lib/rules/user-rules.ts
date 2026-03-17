import { prisma } from '@/lib/prisma'
import type { Rule } from './engine'
import type { TransactionFact, CategorizationResult } from './categorization'

// ── Condition JSON types ──────────────────────────────────────────────────────

interface ConditionDef {
  field: string
  operator: string
  value: string | number | string[] | [number, number]
}

interface ConditionGroup {
  all?: ConditionDef[]
  any?: ConditionDef[]
}

// ── Field accessor ────────────────────────────────────────────────────────────

function getField(fact: TransactionFact, field: string): string | number | null {
  switch (field) {
    case 'description':    return fact.description
    case 'payeeName':      return fact.payeeName
    case 'rawDescription': return fact.rawDescription
    case 'amount':         return fact.amount
    case 'currency':       return fact.currency
    default:               return null
  }
}

// ── Operator evaluation ───────────────────────────────────────────────────────

function evalOperator(
  fieldValue: string | number | null,
  operator: string,
  target: string | number | string[] | [number, number]
): boolean {
  if (fieldValue === null || fieldValue === undefined) return false

  const strVal = String(fieldValue).toLowerCase()
  const strTarget = String(target).toLowerCase()

  switch (operator) {
    case 'contains':    return strVal.includes(strTarget)
    case 'equals':      return strVal === strTarget
    case 'starts_with': return strVal.startsWith(strTarget)
    case 'regex': {
      try { return new RegExp(String(target), 'i').test(String(fieldValue)) } catch { return false }
    }
    case 'gt':          return Number(fieldValue) > Number(target)
    case 'lt':          return Number(fieldValue) < Number(target)
    case 'gte':         return Number(fieldValue) >= Number(target)
    case 'lte':         return Number(fieldValue) <= Number(target)
    case 'in':
    case 'oneOf':       return (target as string[]).map((t) => t.toLowerCase()).includes(strVal)
    case 'between': {
      const [min, max] = target as [number, number]
      return Number(fieldValue) >= min && Number(fieldValue) <= max
    }
    default: return false
  }
}

// ── Condition hydration ───────────────────────────────────────────────────────

export function buildCondition(
  group: ConditionGroup
): (fact: TransactionFact) => boolean {
  const defs = group.all ?? group.any ?? []
  const mode = group.any ? 'some' : 'every'

  return (fact: TransactionFact) =>
    (defs as ConditionDef[])[mode]((cond) =>
      evalOperator(getField(fact, cond.field), cond.operator, cond.value)
    )
}

// ── Public loader ─────────────────────────────────────────────────────────────

export async function loadUserRules(
  userId: string
): Promise<Rule<TransactionFact, CategorizationResult>[]> {
  const rows = await prisma.categorizationRule.findMany({
    where: { userId, isActive: true },
    orderBy: { priority: 'asc' },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    priority: row.priority,
    condition: buildCondition(row.conditions as ConditionGroup),
    action: () => ({
      categoryName: row.categoryName,
      categoryId: row.categoryId ?? null,
      payeeId: row.payeeId ?? null,
      projectId: row.projectId ?? null,
      confidence: 'high' as const,
      ruleId: row.id,
    }),
  }))
}

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
    case 'merchantName':   return fact.merchantName
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
    case 'regex':       return new RegExp(String(target), 'i').test(String(fieldValue))
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
      merchantName: row.merchantName ?? null,
      payeeId: row.payeeId ?? null,
      projectId: row.projectId ?? null,
      confidence: 'high' as const,
      ruleId: row.id,
    }),
  }))
}

// ── Build a rule suggestion from a manual correction ─────────────────────────

export interface UserCorrection {
  transaction: {
    description: string
    merchantName?: string | null
    amount: number
  }
  categoryName: string
  projectId?: string | null
}

export function buildRuleFromCorrection(correction: UserCorrection): {
  name: string
  priority: number
  conditions: ConditionGroup
  categoryName: string
  projectId: string | null
} {
  const { transaction: tx } = correction
  const all: ConditionDef[] = []

  // Match direction (expense vs income) first
  all.push({ field: 'amount', operator: tx.amount < 0 ? 'lt' : 'gt', value: 0 })

  // Prefer merchant (more reliable), fall back to keywords from description
  if (tx.merchantName && tx.merchantName.trim().length > 2) {
    all.push({ field: 'merchantName', operator: 'contains', value: tx.merchantName.trim().toLowerCase() })
  } else {
    const keywords = tx.description
      .split(/\s+/)
      .filter((w) => w.length > 3 && !/^\d+$/.test(w))
      .slice(0, 3)
      .join(' ')
      .toLowerCase()
    if (keywords) {
      all.push({ field: 'description', operator: 'contains', value: keywords })
    }
  }

  const label = tx.merchantName?.trim() || tx.description.slice(0, 30)

  return {
    name: `${label} → ${correction.categoryName}`,
    priority: 50,
    conditions: { all },
    categoryName: correction.categoryName,
    projectId: correction.projectId ?? null,
  }
}

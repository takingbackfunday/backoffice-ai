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

function getField(fact: TransactionFact, field: string): string | number | string[] | null {
  switch (field) {
    case 'description':    return fact.description
    case 'payeeName':      return fact.payeeName
    case 'rawDescription': return fact.rawDescription
    case 'amount':         return fact.amount
    case 'currency':       return fact.currency
    case 'accountName':    return fact.accountName
    case 'notes':          return fact.notes
    case 'tag':            return fact.tags  // array — handled specially
    case 'date':           return fact.date.toISOString().slice(0, 10) // YYYY-MM-DD
    case 'month':          return fact.date.toISOString().slice(0, 7)  // YYYY-MM
    case 'dayOfWeek': {
      const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
      return days[fact.date.getDay()]
    }
    default:               return null
  }
}

// ── Operator evaluation ───────────────────────────────────────────────────────

function evalOperator(
  fieldValue: string | number | string[] | null,
  operator: string,
  target: string | number | string[] | [number, number]
): boolean {
  if (fieldValue === null || fieldValue === undefined) return false

  // Array fields (tags) use special operators
  if (Array.isArray(fieldValue)) {
    const vals = fieldValue.map((v) => v.toLowerCase())
    const targets = Array.isArray(target)
      ? (target as string[]).map((t) => t.toLowerCase())
      : [String(target).toLowerCase()]
    switch (operator) {
      case 'contains':
      case 'includes':
      case 'oneOf':    return targets.some((t) => vals.includes(t))
      case 'equals':   return targets.every((t) => vals.includes(t)) && vals.length === targets.length
      case 'not_contains':
      case 'excludes': return !targets.some((t) => vals.includes(t))
      default:         return false
    }
  }

  const strVal = String(fieldValue).toLowerCase()
  const strTarget = String(target).toLowerCase()

  switch (operator) {
    case 'contains':     return strVal.includes(strTarget)
    case 'not_contains': return !strVal.includes(strTarget)
    case 'equals':       return strVal === strTarget
    case 'not_equals':   return strVal !== strTarget
    case 'starts_with':  return strVal.startsWith(strTarget)
    case 'ends_with':    return strVal.endsWith(strTarget)
    case 'regex': {
      try { return new RegExp(String(target), 'i').test(String(fieldValue)) } catch { return false }
    }
    case 'gt':           return Number(fieldValue) > Number(target)
    case 'lt':           return Number(fieldValue) < Number(target)
    case 'gte':          return Number(fieldValue) >= Number(target)
    case 'lte':          return Number(fieldValue) <= Number(target)
    case 'in':
    case 'oneOf':        return (target as string[]).map((t) => t.toLowerCase()).includes(strVal)
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
        projectId: row.projectId ?? null,
        notes: meta.setNotes ?? null,
        addTags: meta.addTags ?? [],
        confidence: 'high' as const,
        ruleId: row.id,
      }),
    }
  })
}

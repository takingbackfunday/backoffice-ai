export interface ConditionDef {
  field: string
  operator: string
  value: string | number | string[] | [number, number]
}

// ── Field accessor ─────────────────────────────────────────────────────────────

export function getFieldValue(
  tx: {
    description: string
    payeeName: string | null
    amount: number
    accountName: string | null
    rawDescription?: string
    currency?: string
    notes?: string | null
    tags?: string[]
    date?: Date
  },
  field: string
): string | number | string[] | null {
  switch (field) {
    case 'description':    return tx.description
    case 'payeeName':      return tx.payeeName
    case 'rawDescription': return tx.rawDescription ?? null
    case 'amount':         return tx.amount
    case 'currency':       return tx.currency ?? null
    case 'accountName':    return tx.accountName
    case 'notes':          return tx.notes ?? null
    case 'tag':            return tx.tags ?? null  // array — handled specially by evaluateOperator
    case 'date':           return tx.date ? tx.date.toISOString().slice(0, 10) : null // YYYY-MM-DD
    case 'month':          return tx.date ? tx.date.toISOString().slice(0, 7) : null  // YYYY-MM
    case 'dayOfWeek': {
      if (!tx.date) return null
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      return days[tx.date.getDay()]
    }
    default:               return null
  }
}

// ── Operator evaluator ─────────────────────────────────────────────────────────

export function evaluateOperator(
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

// ── Condition-set matcher ──────────────────────────────────────────────────────

export function matchesConditions(
  conditions: { all?: ConditionDef[]; any?: ConditionDef[] },
  tx: { description: string; payeeName: string | null; amount: number; accountName: string | null }
): boolean {
  if (conditions.all) {
    return conditions.all.every((cond) =>
      evaluateOperator(getFieldValue(tx as Parameters<typeof getFieldValue>[0], cond.field), cond.operator, cond.value)
    )
  }
  if (conditions.any) {
    return conditions.any.some((cond) =>
      evaluateOperator(getFieldValue(tx as Parameters<typeof getFieldValue>[0], cond.field), cond.operator, cond.value)
    )
  }
  return false
}

// Shared types + constants for the rules UI (editor, manager, agent, cells).

import type { UserRuleLike } from '@/lib/rules/rule-conflicts'

export type ConditionOp = 'and' | 'or'
export type ConditionField =
  | 'payeeName' | 'description' | 'amount' | 'currency'
  | 'accountName' | 'notes' | 'date' | 'month' | 'dayOfWeek'
export type ConditionOperator =
  | 'contains' | 'not_contains' | 'equals' | 'not_equals'
  | 'starts_with' | 'ends_with' | 'regex' | 'oneOf' | 'includes' | 'excludes'
  | 'gt' | 'lt' | 'gte' | 'lte'

export interface ConditionDef {
  field: ConditionField
  operator: ConditionOperator
  value: string
}

export type OutputActionType = 'category' | 'payee' | 'project' | 'notes'
export interface OutputAction {
  type: OutputActionType
  /** category → category id · payee → payee id · project → workspace id · notes → text */
  value: string
  /** Display text for an unmatched payee draft (explicit-create flow). */
  label?: string
}

export interface CategoryGroup {
  id: string
  name: string
  categories: { id: string; name: string }[]
}

export interface Payee { id: string; name: string }

export interface UserRule {
  id: string
  name: string
  priority: number
  categoryName: string
  categoryId: string | null
  categoryRef: { id: string; name: string; group: { id: string; name: string } } | null
  payeeId: string | null
  payee: { id: string; name: string } | null
  /** @deprecated Prisma field is `workspaceId` — kept for legacy client shapes. */
  projectId?: string | null
  workspaceId?: string | null
  workspace: { id: string; name: string } | null
  setNotes?: string | null
  conditions: {
    all?: { field: string; operator: string; value: string | number | string[] }[]
    any?: { field: string; operator: string; value: string | number | string[] }[]
  }
  isActive: boolean
  updatedAt?: string | Date
}

// Which fields are numeric (use numeric operators)
export const AMOUNT_FIELDS = new Set<ConditionField>(['amount'])
// Which fields use date-style operators
export const DATE_FIELDS = new Set<ConditionField>(['date', 'month', 'dayOfWeek'])

export const FIELD_OPTIONS: { value: ConditionField; label: string; group: string }[] = [
  // Transaction data
  { value: 'description',  label: 'Description',   group: 'Transaction' },
  { value: 'amount',       label: 'Amount',         group: 'Transaction' },
  { value: 'currency',     label: 'Currency',       group: 'Transaction' },
  { value: 'notes',        label: 'Notes',          group: 'Transaction' },
  // Linked records
  { value: 'payeeName',    label: 'Payee name',     group: 'Linked' },
  { value: 'accountName',  label: 'Account name',   group: 'Linked' },
  // Date
  { value: 'date',         label: 'Date (YYYY-MM-DD)', group: 'Date' },
  { value: 'month',        label: 'Month (YYYY-MM)',   group: 'Date' },
  { value: 'dayOfWeek',    label: 'Day of week',       group: 'Date' },
]

export const OPERATOR_OPTIONS: { value: ConditionOperator; label: string; forAmount?: boolean; forArray?: boolean; forText?: boolean }[] = [
  // Text operators
  { value: 'contains',     label: 'contains',        forText: true },
  { value: 'not_contains', label: 'does not contain', forText: true },
  { value: 'equals',       label: 'equals' },
  { value: 'not_equals',   label: 'does not equal' },
  { value: 'starts_with',  label: 'starts with',     forText: true },
  { value: 'ends_with',    label: 'ends with',       forText: true },
  { value: 'oneOf',        label: 'is one of',       forText: true },
  { value: 'regex',        label: 'matches regex',   forText: true },
  // Numeric operators
  { value: 'gt',           label: '>',               forAmount: true },
  { value: 'lt',           label: '<',               forAmount: true },
  { value: 'gte',          label: '≥',               forAmount: true },
  { value: 'lte',          label: '≤',               forAmount: true },
]

export const OUTPUT_TYPE_LABELS: Record<OutputActionType, string> = {
  category: 'Set category',
  payee:    'Assign payee',
  project:  'Assign project',
  notes:    'Set notes',
}

export function defaultCondition(): ConditionDef {
  return { field: 'description', operator: 'contains', value: '' }
}

/** Map a UI rule to the shape the pure conflict detector understands. */
export function userRuleToLike(r: UserRule): UserRuleLike {
  return {
    id: r.id,
    name: r.name,
    priority: r.priority,
    isActive: r.isActive,
    conditions: r.conditions,
    categoryId: r.categoryId ?? null,
    categoryName: r.categoryName ?? null,
    payeeId: r.payeeId ?? null,
    workspaceId: r.workspaceId ?? r.projectId ?? null,
    setNotes: r.setNotes ?? null,
  }
}

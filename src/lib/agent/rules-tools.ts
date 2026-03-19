import { prisma } from '@/lib/prisma'
import type { ToolDefinition } from '@/lib/llm/openrouter'
import { FINANCE_TOOLS, dispatchTool } from '@/lib/agent/finance-tools'

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ConditionDef {
  field: string
  operator: string
  value: string | number | string[]
}

export interface TxSnapshot {
  id: string
  amount: number
  description: string
  payeeName: string | null
  categoryId: string | null
  accountName: string | null
}

export interface RulesContext {
  send: (event: RulesSseEvent) => void
  transactions: TxSnapshot[]
  categoryMap: Map<string, string>   // name.toLowerCase() → id
  payeeMap: Map<string, string>      // name.toLowerCase() → id
  existingRuleConditions: ConditionDef[][]
  coveredByExisting: Set<string>
  coveredThisRun: Set<string>
}

export type RuleImpact = 'low' | 'medium' | 'high'

// high if: many transactions OR large dollar volume
// low only if: few transactions AND small dollar volume
export function computeImpact(matchCount: number, totalAbsAmount: number): RuleImpact {
  if (matchCount > 20 || totalAbsAmount > 700) return 'high'
  if (matchCount <= 5 && totalAbsAmount <= 100) return 'low'
  return 'medium'
}

export interface RulesSseEvent {
  type: 'status' | 'suggestion' | 'done' | 'error'
  message?: string
  rule?: {
    conditions: { all?: ConditionDef[]; any?: ConditionDef[] }
    categoryName: string
    categoryId: string | null
    payeeName: string | null
    payeeId: string | null
    confidence: 'high' | 'medium'
    impact: RuleImpact
    reasoning: string
  }
  reasoning?: string
  matchCount?: number
  totalAmount?: number
  error?: string
  uncategorised?: number
  noPayee?: number
}

// ── Match helper ──────────────────────────────────────────────────────────────

function getMatchedIds(
  defs: ConditionDef[],
  transactions: TxSnapshot[]
): Set<string> {
  const ids = new Set<string>()
  for (const tx of transactions) {
    const matches = defs.every((def) => {
      let txVal: string
      if (def.field === 'payeeName') {
        txVal = tx.payeeName ?? ''
      } else if (def.field === 'description') {
        txVal = tx.description
      } else if (def.field === 'amount') {
        txVal = String(tx.amount)
      } else if (def.field === 'accountName') {
        txVal = tx.accountName ?? ''
      } else {
        txVal = ''
      }
      const v = String(def.value).toLowerCase()
      const t = txVal.toLowerCase()
      if (def.operator === 'contains') return t.includes(v)
      if (def.operator === 'not_contains') return !t.includes(v)
      if (def.operator === 'equals') return t === v
      if (def.operator === 'not_equals') return t !== v
      if (def.operator === 'starts_with') return t.startsWith(v)
      if (def.operator === 'ends_with') return t.endsWith(v)
      if (def.operator === 'regex') {
        try { return new RegExp(String(def.value), 'i').test(txVal) } catch { return false }
      }
      if (def.operator === 'gt') return Number(txVal) > Number(def.value)
      if (def.operator === 'lt') return Number(txVal) < Number(def.value)
      if (def.operator === 'gte') return Number(txVal) >= Number(def.value)
      if (def.operator === 'lte') return Number(txVal) <= Number(def.value)
      if (def.operator === 'oneOf')
        return (def.value as string[]).some((ov) => t === ov.toLowerCase())
      return false
    })
    if (matches) ids.add(tx.id)
  }
  return ids
}

// ── Tool implementations ──────────────────────────────────────────────────────

export async function get_uncategorised_transactions(
  userId: string,
  args: { topN?: number; minCount?: number },
  ctx: RulesContext
): Promise<string> {
  const topN = args.topN ?? 30
  const minCount = args.minCount ?? 1

  // Exclude transactions already covered by existing rules — no point suggesting rules for those
  const uncategorised = ctx.transactions.filter((t) => !t.categoryId && !ctx.coveredByExisting.has(t.id))

  if (!uncategorised.length) return 'No uncategorised transactions found.'

  type Group = {
    count: number
    totalAmount: number
    samples: string[]
    matchField: 'payeeName' | 'description'
    matchValue: string
  }
  const groups = new Map<string, Group>()

  for (const tx of uncategorised) {
    let matchField: 'payeeName' | 'description'
    let key: string
    if (tx.payeeName) {
      matchField = 'payeeName'
      key = tx.payeeName
    } else {
      const words = tx.description.trim().split(/\s+/)
      const firstMeaningful = words.find((w) => w.length >= 5) ?? words[0]
      const twoWords = words.slice(0, 2).join(' ')
      key = twoWords.length >= 6 ? twoWords : firstMeaningful
      matchField = 'description'
    }
    if (!key || key.length < 2) continue
    const e = groups.get(key) ?? { count: 0, totalAmount: 0, samples: [], matchField, matchValue: key }
    e.count++
    e.totalAmount += tx.amount
    if (e.samples.length < 3) e.samples.push(tx.description.slice(0, 60))
    groups.set(key, e)
  }

  const sorted = [...groups.entries()]
    .filter(([, v]) => v.count >= minCount)
    .sort((a, b) => Math.abs(b[1].totalAmount) - Math.abs(a[1].totalAmount))
    .slice(0, topN)

  if (!sorted.length) return 'No uncategorised transaction groups found matching criteria.'

  // Also include singletons (count=1) that didn't make it into a group
  const groupedKeys = new Set(
    [...groups.entries()].filter(([, v]) => v.count >= 2).map(([k]) => k)
  )
  const singletons: string[] = []
  for (const tx of uncategorised) {
    let key: string
    if (tx.payeeName) {
      key = tx.payeeName
    } else {
      const words = tx.description.trim().split(/\s+/)
      const firstMeaningful = words.find((w) => w.length >= 5) ?? words[0]
      const twoWords = words.slice(0, 2).join(' ')
      key = twoWords.length >= 6 ? twoWords : firstMeaningful
    }
    if (!groupedKeys.has(key)) {
      singletons.push(`  singleton | description:"${tx.description.slice(0, 70)}" | amount:${tx.amount.toFixed(2)}`)
    }
  }
  const seenSingle = new Set<string>()
  const uniqueSingletons = singletons.filter((s) => {
    if (seenSingle.has(s)) return false
    seenSingle.add(s)
    return true
  }).slice(0, 20)

  // Collect all unique raw descriptions per group (up to 8) so the agent
  // can spot description variants and choose the right match condition
  const groupDescriptions = new Map<string, Set<string>>()
  for (const tx of uncategorised) {
    let key: string
    if (tx.payeeName) {
      key = tx.payeeName
    } else {
      const words = tx.description.trim().split(/\s+/)
      const firstMeaningful = words.find((w) => w.length >= 5) ?? words[0]
      const twoWords = words.slice(0, 2).join(' ')
      key = twoWords.length >= 6 ? twoWords : firstMeaningful
    }
    if (!key || key.length < 2) continue
    if (!groupDescriptions.has(key)) groupDescriptions.set(key, new Set())
    const set = groupDescriptions.get(key)!
    if (set.size < 8) set.add(tx.description.slice(0, 80))
  }

  const lines = sorted.map(([name, v]) => {
    const descs = [...(groupDescriptions.get(name) ?? [])].join(' | ')
    return `  name:"${name}" | matchField:${v.matchField} | count:${v.count} | total:${v.totalAmount.toFixed(2)} | descriptions: ${descs}`
  })

  let result = `${sorted.length} uncategorised groups, sorted by absolute spend descending (min count: ${minCount}):\nname | matchField | count | total_spend | samples\n${lines.join('\n')}`
  if (uniqueSingletons.length) {
    result += `\n\nSingleton transactions (count=1, use world knowledge):\n${uniqueSingletons.join('\n')}`
  }
  return result
}

export async function get_no_payee_transactions(
  _userId: string,
  args: { topN?: number },
  ctx: RulesContext
): Promise<string> {
  const topN = args.topN ?? 20

  // Exclude transactions already covered by existing rules
  const noPayeeWithCategory = ctx.transactions.filter((t) => t.categoryId && !t.payeeName && !ctx.coveredByExisting.has(t.id))

  if (!noPayeeWithCategory.length) return 'No transactions found with a category but no payee.'

  // Reverse-look up category names from IDs
  const categoryIdToName = new Map<string, string>()
  for (const [name, id] of ctx.categoryMap) {
    categoryIdToName.set(id, name)
  }

  type Group = { count: number; categoryName: string; samples: string[] }
  const groups = new Map<string, Group>()

  for (const tx of noPayeeWithCategory) {
    const words = tx.description.trim().split(/\s+/)
    const firstMeaningful = words.find((w) => w.length >= 5) ?? words[0]
    const twoWords = words.slice(0, 2).join(' ')
    const key = twoWords.length >= 6 ? twoWords : firstMeaningful
    if (!key || key.length < 3) continue
    const catName = categoryIdToName.get(tx.categoryId!) ?? tx.categoryId ?? '(unknown)'
    const e = groups.get(key) ?? { count: 0, categoryName: catName, samples: [] }
    e.count++
    if (e.samples.length < 3) e.samples.push(tx.description.slice(0, 60))
    groups.set(key, e)
  }

  const sorted = [...groups.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)

  if (!sorted.length) return 'No no-payee groups with 2+ transactions found.'

  const lines = sorted.map(([name, v]) =>
    `  name:"${name}" | count:${v.count} | category:${v.categoryName} | samples:${v.samples.join('; ')}`
  )
  return `${sorted.length} groups with category but no payee:\nname | count | category | samples\n${lines.join('\n')}`
}

export async function emit_rule_suggestion(
  _userId: string,
  args: {
    conditions: { all?: ConditionDef[]; any?: ConditionDef[] }
    categoryName: string
    payeeName: string | null
    confidence: 'high' | 'medium'
    reasoning: string
  },
  ctx: RulesContext
): Promise<string> {
  // Reject reasoning that mentions unrelated merchants (copy-paste artifact)
  if (args.reasoning && args.payeeName) {
    const otherMerchantPattern = /\b(wayfair|zalando|amazon|stripe|github|netflix|spotify|uber|aws)\b/i
    const mentionsOther = otherMerchantPattern.test(args.reasoning)
    const mentionsSelf = args.payeeName && args.reasoning.toLowerCase().includes(args.payeeName.toLowerCase())
    if (mentionsOther && !mentionsSelf) {
      return `Rejected: reasoning mentions an unrelated merchant. Write a 1-sentence reasoning specific to "${args.payeeName}" and resubmit.`
    }
  }

  // Validate shape
  if (!args.conditions || (!args.conditions.all && !args.conditions.any)) {
    return 'Rejected: conditions must have "all" or "any" array. Fix the conditions structure and resubmit.'
  }
  const defs = args.conditions.all ?? args.conditions.any ?? []
  if (!defs.length) return 'Rejected: conditions array is empty. Add at least one condition (description contains / payeeName equals) and resubmit.'

  // Reject date conditions — rules engine has no date field, they always match 0 transactions
  const hasDate = defs.some((d) => d.field === 'date')
  if (hasDate) return 'Rejected: "date" is not a valid rule condition field. Remove the date condition — rules match on description, payeeName, amount, and accountName only. Resubmit without the date condition.'

  // Reject amount-only conditions
  const hasNonAmount = defs.some((d) => d.field !== 'amount')
  if (!hasNonAmount) return 'Rejected: must have at least one non-amount condition. Add a description or payeeName condition alongside the amount condition and resubmit.'

  // Reject overly short/generic values for plain-string operators
  for (const def of defs) {
    if (def.field === 'description' && (def.operator === 'contains' || def.operator === 'starts_with' || def.operator === 'equals')) {
      const val = String(def.value).trim()
      if (val.length < 3) {
        return `Rejected: description ${def.operator} value "${val}" is too short (min 3 characters). Use a more specific keyword or use operator "regex" for pattern matching and resubmit.`
      }
    }
    // Validate regex patterns are valid
    if (def.operator === 'regex') {
      try { new RegExp(String(def.value)) } catch {
        return `Rejected: regex pattern "${def.value}" is invalid. Fix the pattern and resubmit.`
      }
    }
  }

  // Validate category exists
  const categoryId = ctx.categoryMap.get(args.categoryName.toLowerCase()) ?? null
  if (!categoryId) {
    const available = [...ctx.categoryMap.keys()].join(', ')
    return `Rejected: category "${args.categoryName}" not found. You MUST use an exact name from this list (case-insensitive): ${available}. Do NOT invent category names — pick the closest match from the list and resubmit.`
  }

  // Resolve payeeId (may be null if payee doesn't exist yet — that's OK)
  const payeeId = args.payeeName
    ? (ctx.payeeMap.get(args.payeeName.toLowerCase()) ?? null)
    : null

  // Count matched transactions
  const matchedIds = getMatchedIds(defs, ctx.transactions)
  const newIds = [...matchedIds].filter(
    (id) => !ctx.coveredByExisting.has(id) && !ctx.coveredThisRun.has(id)
  )
  const matchCount = newIds.length

  // Reject only if this suggestion adds zero new coverage
  if (matchCount === 0) {
    const overlapRun = [...matchedIds].filter((id) => ctx.coveredThisRun.has(id)).length
    if (overlapRun > 0) {
      return `Rejected: all matched transactions are already covered by a suggestion emitted earlier this run. Skip this one and continue with others.`
    }
    if (args.confidence !== 'medium') {
      return 'Rejected: 0 transactions matched. Either (a) broaden the condition (use "contains" instead of "equals", or use a shorter keyword), (b) set confidence to "medium" if you are reasoning from world knowledge, or (c) skip this one.'
    }
    // medium confidence + 0 matches = allowed (singleton/world-knowledge suggestion)
  }

  // Mark as covered
  newIds.forEach((id) => ctx.coveredThisRun.add(id))

  // Compute total absolute dollar amount of newly matched transactions
  const newIdSet = new Set(newIds)
  const totalAbsAmount = ctx.transactions
    .filter((t) => newIdSet.has(t.id))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const impact = computeImpact(matchCount, totalAbsAmount)

  // Stream suggestion
  ctx.send({
    type: 'suggestion',
    rule: {
      conditions: args.conditions,
      categoryName: args.categoryName,
      categoryId,
      payeeName: args.payeeName ?? null,
      payeeId,
      confidence: args.confidence,
      impact,
      reasoning: args.reasoning,
    },
    reasoning: args.reasoning,
    matchCount,
    totalAmount: Math.round(totalAbsAmount * 100) / 100,
  })

  return `Emitted: ${matchCount} new transaction(s) matched.`
}

// ── Pre-loader (called once at route start) ───────────────────────────────────

export async function loadRulesContext(userId: string): Promise<{
  transactions: TxSnapshot[]
  categoryMap: Map<string, string>
  payeeMap: Map<string, string>
  existingRuleConditions: ConditionDef[][]
  coveredByExisting: Set<string>
}> {
  const [transactions, categories, payees, existingRules] = await Promise.all([
    prisma.transaction.findMany({
      where: { account: { userId } },
      select: {
        id: true,
        amount: true,
        description: true,
        categoryId: true,
        payee: { select: { name: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.payee.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.categorizationRule.findMany({
      where: { userId, isActive: true },
      select: { conditions: true },
    }),
  ])

  const txSnapshots: TxSnapshot[] = transactions.map((t) => ({
    id: t.id,
    amount: Number(t.amount),
    description: t.description,
    payeeName: t.payee?.name ?? null,
    categoryId: t.categoryId,
    accountName: t.account?.name ?? null,
  }))

  const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
  const payeeMap = new Map(payees.map((p) => [p.name.toLowerCase(), p.id]))

  const existingRuleConditions: ConditionDef[][] = existingRules.map((r) => {
    const conds = r.conditions as { all?: unknown[]; any?: unknown[] }
    return ((conds.all ?? conds.any ?? []) as ConditionDef[])
  })

  const coveredByExisting = new Set<string>()
  for (const defs of existingRuleConditions) {
    getMatchedIds(defs, txSnapshots).forEach((id) => coveredByExisting.add(id))
  }

  return { transactions: txSnapshots, categoryMap, payeeMap, existingRuleConditions, coveredByExisting }
}

export async function record_plan(
  _userId: string,
  args: { summary: string },
  ctx: RulesContext
): Promise<string> {
  if (!args.summary || typeof args.summary !== 'string') {
    return 'Rejected: summary is required.'
  }
  // Log full plan — this is the LLM's reasoning, most useful thing to see
  console.log('[rules-agent] plan:\n' + args.summary)
  ctx.send({ type: 'status', message: `Plan: ${args.summary.slice(0, 200)}` })
  return 'Plan recorded.'
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatchRulesTool(
  userId: string,
  name: string,
  args: unknown,
  ctx: RulesContext
): Promise<string> {
  const a = args as Record<string, unknown>
  switch (name) {
    case 'get_uncategorised_transactions':
      return get_uncategorised_transactions(userId, a as { topN?: number; minCount?: number }, ctx)
    case 'get_no_payee_transactions':
      return get_no_payee_transactions(userId, a as { topN?: number }, ctx)
    case 'emit_rule_suggestion':
      return emit_rule_suggestion(userId, a as Parameters<typeof emit_rule_suggestion>[1], ctx)
    case 'record_plan':
      return record_plan(userId, a as { summary: string }, ctx)
    case 'finish_analysis':
      return 'FINISH_ANALYSIS'
    default:
      return dispatchTool(userId, name, args)
  }
}

// ── Tool schemas ──────────────────────────────────────────────────────────────

const RULES_ONLY_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_uncategorised_transactions',
      description:
        'Get transactions that have no category, grouped by payee name or description prefix. Each group includes match field, count, total amount, and sample descriptions. Also returns singleton transactions for world-knowledge suggestions.',
      parameters: {
        type: 'object',
        properties: {
          topN: {
            type: 'number',
            description: 'Maximum number of groups to return (default 30)',
          },
          minCount: {
            type: 'number',
            description: 'Minimum transactions in a group to include (default 1)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_no_payee_transactions',
      description:
        'Get transactions that have a category but no payee assigned, grouped by description prefix. Use this to suggest payee-assignment rules.',
      parameters: {
        type: 'object',
        properties: {
          topN: {
            type: 'number',
            description: 'Maximum number of groups to return (default 20)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'emit_rule_suggestion',
      description:
        'Emit a rule suggestion. The server validates the shape, counts matched transactions, and streams the suggestion to the UI. Returns confirmation or a rejection reason. IMPORTANT: condition values must be plain literal strings — no regex, no wildcards, no special characters.',
      parameters: {
        type: 'object',
        required: ['conditions', 'categoryName', 'confidence', 'reasoning'],
        properties: {
          conditions: {
            type: 'object',
            description: 'Rule conditions. Use "all" for AND logic, "any" for OR logic.',
            properties: {
              all: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['field', 'operator', 'value'],
                  properties: {
                    field: {
                      type: 'string',
                      enum: ['description', 'payeeName', 'amount', 'accountName'],
                      description: 'Transaction field to match. ALWAYS use "description" as the primary condition — it is the most reliable. "payeeName" is secondary and only works if a payee already exists. Do NOT use "date".',
                    },
                    operator: {
                      type: 'string',
                      enum: ['contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with', 'regex', 'oneOf', 'gt', 'lt', 'gte', 'lte'],
                      description: 'Use "regex" for pattern matching (e.g. matching alphanumeric codes). All other operators do plain string matching.',
                    },
                    value: {
                      description: 'Value to match against — string, number, array for oneOf, or regex pattern string for regex operator',
                    },
                  },
                },
              },
              any: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['field', 'operator', 'value'],
                  properties: {
                    field: {
                      type: 'string',
                      enum: ['description', 'payeeName', 'amount', 'accountName'],
                      description: 'ALWAYS use "description" as the primary condition. Do NOT use "date".',
                    },
                    operator: {
                      type: 'string',
                      enum: ['contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with', 'regex', 'oneOf', 'gt', 'lt', 'gte', 'lte'],
                      description: 'Use "regex" for pattern matching. All other operators do plain string matching.',
                    },
                    value: {
                      description: 'Value to match against',
                    },
                  },
                },
              },
            },
          },
          categoryName: {
            type: 'string',
            description:
              'Exact category name from get_categories. Must match exactly (case-insensitive).',
          },
          payeeName: {
            type: ['string', 'null'],
            description:
              'Payee name to assign. ALWAYS set this using world knowledge when the merchant is identifiable (e.g. "Wayfair", "Zalando", "GitHub", "Stripe", "AWS"). Check existing payees list first and reuse exact spelling if matched. Only null if the counterparty is genuinely ambiguous.',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium'],
            description:
              'high = 2+ matching transactions; medium = 1 transaction or world-knowledge inference',
          },
          reasoning: {
            type: 'string',
            description: '1 sentence explaining why this rule makes sense',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_plan',
      description:
        'Record your analysis strategy before emitting suggestions. Call this FIRST, before any emit_rule_suggestion calls. Describe which patterns you identified and how you plan to categorise them. This is shown to the user as a status message.',
      parameters: {
        type: 'object',
        required: ['summary'],
        properties: {
          summary: {
            type: 'string',
            description:
              'Brief (1-3 sentence) plan: which merchant/pattern groups you spotted, which categories they map to, and any payees you will assign. Example: "Found 6 Wayfair charges → Household. 4 Uber → Transport (payee: Uber). 3 AWS → Software (payee: Amazon Web Services). Checking rules first to avoid duplicates."',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_analysis',
      description:
        'Call this when you have finished emitting all rule suggestions. Signals the server to close the stream.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

// All 19 tools: 14 finance + 5 rules
export const RULES_TOOLS: ToolDefinition[] = [...FINANCE_TOOLS, ...RULES_ONLY_TOOLS]

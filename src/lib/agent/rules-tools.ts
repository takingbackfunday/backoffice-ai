import { prisma } from '@/lib/prisma'
import type { ToolDefinition } from '@/lib/llm/openrouter'
import { FINANCE_TOOLS, dispatchTool } from '@/lib/agent/finance-tools'
import { matchesConditions, type ConditionDef } from '@/lib/rules/evaluate-condition'

export type { ConditionDef }

// ── Shared types ──────────────────────────────────────────────────────────────

export interface TxSnapshot {
  id: string
  amount: number
  description: string
  rawDescription?: string
  payeeName: string | null
  categoryId: string | null
  accountName: string | null
  currency?: string
  workspaceId: string | null
  tags: string[]
}

export interface RulesContext {
  send: (event: RulesSseEvent) => void
  transactions: TxSnapshot[]
  categoryMap: Map<string, string>    // name.toLowerCase() → id
  payeeMap: Map<string, string>       // name.toLowerCase() → id
  workspaceMap: Map<string, string>   // name.toLowerCase() → id
  coveredByExisting: Set<string>
  coveredThisRun: Set<string>
  sourceEditIds?: Set<string>         // tx IDs that triggered this run — exempt from reclassification guard
}

export type RuleImpact = 'low' | 'medium' | 'high'

// high if: many transactions OR large dollar volume
// low only if: few transactions AND small dollar volume
// TODO: thresholds are absolute values — they don't account for currency differences
// (e.g. JPY amounts are 100x larger than EUR). Consider making these relative to
// the user's median transaction amount once we have that data available in context.
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
    workspaceId: string | null
    workspaceName: string | null
    confidence: 'high' | 'medium'
    impact: RuleImpact
    reasoning: string
  }
  reasoning?: string
  matchCount?: number
  totalAmount?: number
  sampleTransactions?: { description: string; amount: number }[]
  error?: string
  uncategorised?: number
  noPayee?: number
}

// ── Match helper ──────────────────────────────────────────────────────────────

function getMatchedIds(
  conditions: { all?: ConditionDef[]; any?: ConditionDef[] },
  transactions: TxSnapshot[]
): Set<string> {
  const ids = new Set<string>()
  for (const tx of transactions) {
    if (matchesConditions(conditions, tx)) ids.add(tx.id)
  }
  return ids
}

// ── Grouping key helper ───────────────────────────────────────────────────────

/** Common banking prefixes/terms that appear in many unrelated transactions */
const BANKING_NOISE = /^(sepa|dd|ct|deb|crd|pos|ref|ach|chq|bgc|stp|bacs|swift|wire|transfer|payment)\b/i
const REF_CODE = /\b[A-Z0-9]{6,}\b/  // alphanumeric reference codes

function extractGroupingKey(tx: { description: string; payeeName: string | null }): { key: string; matchField: 'payeeName' | 'description' } | null {
  if (tx.payeeName) {
    return { key: tx.payeeName, matchField: 'payeeName' }
  }
  // Strip common banking noise and reference codes
  let cleaned = tx.description.trim()
    .replace(BANKING_NOISE, '')
    .replace(REF_CODE, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) cleaned = tx.description.trim()

  const words = cleaned.split(/\s+/)
  const firstMeaningful = words.find((w) => w.length >= 5) ?? words[0]
  const twoWords = words.slice(0, 2).join(' ')
  const key = twoWords.length >= 6 ? twoWords : firstMeaningful
  if (!key || key.length < 2) return null
  return { key, matchField: 'description' }
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
    const result = extractGroupingKey(tx)
    if (!result) continue
    const { key, matchField } = result
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
    const result = extractGroupingKey(tx)
    if (!result) continue
    if (!groupedKeys.has(result.key)) {
      singletons.push(`  singleton | description:"${tx.description.slice(0, 70)}" | amount:${tx.amount.toFixed(2)}`)
    }
  }
  const seenSingle = new Set<string>()
  const uniqueSingletons = singletons.filter((s) => {
    if (seenSingle.has(s)) return false
    seenSingle.add(s)
    return true
  }).slice(0, 10)

  // Collect raw descriptions WITH individual amounts per group (up to 8)
  // so the agent can spot amount patterns (e.g. round amounts = ATM withdrawals)
  const groupDescriptions = new Map<string, { desc: string; amount: number }[]>()
  for (const tx of uncategorised) {
    const result = extractGroupingKey(tx)
    if (!result) continue
    const { key } = result
    if (!groupDescriptions.has(key)) groupDescriptions.set(key, [])
    const arr = groupDescriptions.get(key)!
    if (arr.length < 8) arr.push({ desc: tx.description.slice(0, 80), amount: tx.amount })
  }

  const lines = sorted.map(([name, v]) => {
    const descs = (groupDescriptions.get(name) ?? [])
      .map((d) => `${d.desc} (${d.amount < 0 ? '−' : '+'}${Math.abs(d.amount).toFixed(2)})`)
      .join(' | ')
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
    const result = extractGroupingKey(tx)
    if (!result) continue
    const { key } = result
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
    workspaceName?: string | null
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
  // Deduplicate conditions that differ only by case (matching is case-insensitive)
  const dedupeKey = (d: ConditionDef) => `${d.field}|${d.operator}|${String(d.value).toLowerCase()}`
  const rawDefs = args.conditions.all ?? args.conditions.any ?? []
  const seen = new Set<string>()
  const defs = rawDefs.filter((d) => {
    const k = dedupeKey(d)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  // Write deduplicated list back so downstream logic uses it
  if (args.conditions.all) args.conditions.all = defs as never
  else if (args.conditions.any) args.conditions.any = defs as never

  if (!defs.length) return 'Rejected: conditions array is empty. Add at least one condition (description contains / payeeName equals) and resubmit.'

  // Reject date conditions — rules engine has no date field, they always match 0 transactions
  const hasDate = defs.some((d) => d.field === 'date')
  if (hasDate) return 'Rejected: "date" is not a valid rule condition field. Remove the date condition — rules match on description, payeeName, amount, and accountName only. Resubmit without the date condition.'

  // Reject amount-only conditions
  const hasNonAmount = defs.some((d) => d.field !== 'amount')
  if (!hasNonAmount) return 'Rejected: must have at least one non-amount condition. Add a description or payeeName condition alongside the amount condition and resubmit.'

  // Reject self-referential payee rules: condition "payeeName equals X" + action ONLY sets same payeeName X
  // These are no-ops — the payee is already set. But if the rule also assigns a category or project,
  // "payeeName equals X" is a valid and useful selector — do not reject it.
  if (args.payeeName && !args.categoryName && !args.workspaceName) {
    const payeeCondition = defs.find(
      (d) => d.field === 'payeeName' && (d.operator === 'equals' || d.operator === 'contains') &&
        String(d.value).toLowerCase() === args.payeeName!.toLowerCase()
    )
    if (payeeCondition && defs.every((d) => d.field === 'payeeName' || d.field === 'amount')) {
      return `Rejected: this rule uses "payeeName equals ${args.payeeName}" as its only meaningful condition, then sets payeeName to "${args.payeeName}" — that's a no-op (the payee is already set on those transactions). Use "description contains" as the primary condition instead, so the rule can assign the payee on future transactions that don't have it yet.`
    }
  }

  // Reject overly short/generic values for plain-string operators
  for (const def of defs) {
    if (def.field === 'description' && (def.operator === 'contains' || def.operator === 'starts_with' || def.operator === 'equals')) {
      const val = String(def.value).trim()
      if (val.length < 3) {
        return `Rejected: description ${def.operator} value "${val}" is too short (min 3 characters). Use a more specific keyword or use operator "regex" for pattern matching and resubmit.`
      }
    }
    // Reject short single-word contains values that are common names or words
    if (def.field === 'description' && def.operator === 'contains') {
      const val = String(def.value).trim()
      if (val.length <= 5 && !val.includes(' ')) {
        return `Rejected: description contains "${val}" is too short and generic — a ${val.length}-character single word will likely match unrelated transactions. Use a longer or more specific keyword (e.g. the full merchant name, or add a second condition to narrow the match). Resubmit with a more specific condition.`
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

  // Validate workspace if provided
  let workspaceId: string | null = null
  const workspaceName: string | null = args.workspaceName ?? null
  if (workspaceName) {
    workspaceId = ctx.workspaceMap.get(workspaceName.toLowerCase()) ?? null
    if (!workspaceId) {
      const available = [...ctx.workspaceMap.keys()].join(', ')
      return `Rejected: workspace/project "${workspaceName}" not found. Use an exact name from: ${available}. Copy the name verbatim from the AVAILABLE PROJECTS list and resubmit.`
    }
  }

  // Reject conditions that use payment processor names as keywords — they appear in
  // descriptions as the payment rail ("Urban Sports Gmbh by Adyen") not as the merchant.
  const PAYMENT_PROCESSORS = ['adyen', 'stripe', 'paypal', 'square', 'sumup', 'mollie', 'klarna', 'braintree', 'worldpay', 'checkout.com', 'mangopay']
  for (const def of defs) {
    if (def.field === 'description' && def.operator === 'contains') {
      const val = String(def.value).toLowerCase().trim()
      if (PAYMENT_PROCESSORS.includes(val)) {
        return `Rejected: "${def.value}" is a payment processor, not a merchant — it appears in many unrelated transaction descriptions (e.g. "Urban Sports Gmbh by Adyen"). Use a more specific keyword that identifies the actual merchant instead.`
      }
    }
  }

  // Count matched transactions
  const matchedIds = getMatchedIds(args.conditions, ctx.transactions)

  // For project-assignment rules: reject if the matched transactions span multiple distinct
  // projects — the condition is too broad to safely assign one project.
  if (workspaceId) {
    const projectsHit = new Set(
      [...matchedIds]
        .map(id => ctx.transactions.find(t => t.id === id)?.workspaceId)
        .filter((wid): wid is string => wid != null)
    )
    projectsHit.delete(workspaceId) // remove the intended project
    if (projectsHit.size > 0) {
      const otherNames = [...projectsHit]
        .map(wid => {
          for (const [name, id] of ctx.workspaceMap) if (id === wid) return name
          return '(unnamed project)'
        })
        .join(', ')
      return `Rejected: the condition matches transactions already assigned to other projects (${otherNames}) in addition to "${workspaceName}" — it is too broad to safely assign just this project. Use a more specific condition (e.g. payeeName equals, or a description keyword that only appears in "${workspaceName}" transactions) and resubmit.`
    }
  }

  const newIds = [...matchedIds].filter(
    (id) => !ctx.coveredByExisting.has(id) && !ctx.coveredThisRun.has(id)
  )
  const matchCount = newIds.length

  // Reject if the majority of matched transactions already have a category — this rule
  // would reclassify correctly-categorised transactions (e.g. "Adyen" matching "Urban Sports by Adyen").
  // Exempt:
  //   1. Transactions from triggering edits — the user just set those deliberately.
  //   2. Rules based on payeeName conditions — precise selectors, not generic keywords.
  //   3. Self-learning rules that assign the SAME category as already on the transactions (formalising, not reclassifying).
  //   4. Project-assignment rules (workspaceName set) — additive, never a reclassification.
  const isPayeeConditionRule = defs.every((d) => d.field === 'payeeName' || d.field === 'amount')
  const isProjectAssignment = !!args.workspaceName
  if (!isPayeeConditionRule && !isProjectAssignment) {
    const alreadyCategorised = [...matchedIds]
      .map(id => ctx.transactions.find(t => t.id === id))
      .filter(t => t?.categoryId != null && !ctx.sourceEditIds?.has(t.id)).length
    if (matchedIds.size > 0 && alreadyCategorised / matchedIds.size > 0.4) {
      // Allow if this is a self-learning rule that assigns the same category already on those transactions
      const catId = ctx.categoryMap.get(args.categoryName ?? '')
      const allMatchSameCategory = catId
        ? [...matchedIds].every(id => {
            const t = ctx.transactions.find(tx => tx.id === id)
            return !t || t.categoryId === catId
          })
        : false
      if (!allMatchSameCategory) {
        return `Rejected: ${alreadyCategorised} of ${matchedIds.size} matched transactions already have a category — this rule would reclassify them incorrectly. The keyword "${defs.find(d => d.field === 'description')?.value}" is too generic (likely a payment processor or shared term). Use a more specific keyword that only matches uncategorised transactions.`
      }
    }
  }

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
  const matchedTxs = ctx.transactions.filter((t) => newIdSet.has(t.id))
  const totalAbsAmount = matchedTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const impact = computeImpact(matchCount, totalAbsAmount)

  const sampleTxs = matchedTxs
    .slice(0, 5)
    .map((t) => ({ description: t.description.slice(0, 80), amount: t.amount }))

  // Stream suggestion
  ctx.send({
    type: 'suggestion',
    rule: {
      conditions: args.conditions,
      categoryName: args.categoryName,
      categoryId,
      payeeName: args.payeeName ?? null,
      payeeId,
      workspaceId,
      workspaceName,
      confidence: args.confidence,
      impact,
      reasoning: args.reasoning,
    },
    reasoning: args.reasoning,
    matchCount,
    totalAmount: Math.round(totalAbsAmount * 100) / 100,
    sampleTransactions: sampleTxs,
  })

  return `Emitted: ${matchCount} new transaction(s) matched.`
}

// ── Pre-loader (called once at route start) ───────────────────────────────────

export async function loadRulesContext(userId: string): Promise<{
  transactions: TxSnapshot[]
  categoryMap: Map<string, string>
  payeeMap: Map<string, string>
  workspaceMap: Map<string, string>
  coveredByExisting: Set<string>
}> {
  // Only load transactions from the last 24 months — the agent focuses on recent
  // patterns and this keeps memory usage bounded as data grows.
  const txCutoff = new Date()
  txCutoff.setMonth(txCutoff.getMonth() - 24)

  const [transactions, categories, payees, workspaces, existingRules] = await Promise.all([
    prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: txCutoff } },
      select: {
        id: true,
        amount: true,
        description: true,
        categoryId: true,
        workspaceId: true,
        tags: true,
        payee: { select: { name: true } },
        account: { select: { name: true, currency: true } },
      },
    }),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.payee.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.workspace.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.categorizationRule.findMany({
      where: { userId, isActive: true },
      select: { conditions: true },
    }),
  ])

  const txSnapshots: TxSnapshot[] = transactions.map((t) => ({
    id: t.id,
    amount: Number(t.amount),
    description: t.description,
    rawDescription: t.description, // no separate DB column — same as description
    payeeName: t.payee?.name ?? null,
    categoryId: t.categoryId,
    accountName: t.account?.name ?? null,
    currency: t.account?.currency ?? undefined,
    workspaceId: t.workspaceId ?? null,
    tags: t.tags ?? [],
  }))

  const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
  const payeeMap = new Map(payees.map((p) => [p.name.toLowerCase(), p.id]))
  const workspaceMap = new Map(workspaces.map((w) => [w.name.toLowerCase(), w.id]))

  const coveredByExisting = new Set<string>()
  for (const r of existingRules) {
    const conds = r.conditions as { all?: ConditionDef[]; any?: ConditionDef[] }
    getMatchedIds(conds, txSnapshots).forEach((id) => coveredByExisting.add(id))
  }

  return { transactions: txSnapshots, categoryMap, payeeMap, workspaceMap, coveredByExisting }
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

// ── Self-learning tools ───────────────────────────────────────────────────────

/**
 * Returns already-categorised (or already-payee-tagged) transactions that are NOT
 * covered by any existing rule. These are patterns the user has manually labelled
 * but never formalised as a rule — prime candidates for automation.
 */
export async function get_ruleless_patterns(
  _userId: string,
  args: { topN?: number; minCount?: number },
  ctx: RulesContext
): Promise<string> {
  const topN = args.topN ?? 20
  const minCount = args.minCount ?? 2

  // Already labelled (category OR payee set) but not covered by any rule
  const labelled = ctx.transactions.filter(
    (t) => (t.categoryId || t.payeeName) && !ctx.coveredByExisting.has(t.id)
  )

  if (!labelled.length) return 'No labelled-but-ruleless patterns found.'

  // Reverse-look up category names from IDs
  const categoryIdToName = new Map<string, string>()
  for (const [name, id] of ctx.categoryMap) {
    categoryIdToName.set(id, name)
  }

  type Group = {
    count: number
    categoryName: string | null
    payeeName: string | null
    totalAmount: number
    samples: { desc: string; amount: number }[]
    matchField: 'payeeName' | 'description'
  }
  const groups = new Map<string, Group>()

  for (const tx of labelled) {
    const result = extractGroupingKey(tx)
    if (!result) continue
    const { key, matchField } = result
    const catName = tx.categoryId ? (categoryIdToName.get(tx.categoryId) ?? null) : null
    const e = groups.get(key) ?? { count: 0, categoryName: catName, payeeName: tx.payeeName, totalAmount: 0, samples: [], matchField }
    e.count++
    e.totalAmount += tx.amount
    if (e.samples.length < 8) e.samples.push({ desc: tx.description.slice(0, 80), amount: tx.amount })
    groups.set(key, e)
  }

  const sorted = [...groups.entries()]
    .filter(([, v]) => v.count >= minCount)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)

  if (!sorted.length) return `No labelled-but-ruleless groups with ${minCount}+ transactions found.`

  const lines = sorted.map(([name, v]) => {
    const descs = v.samples
      .map((d) => `${d.desc} (${d.amount < 0 ? '−' : '+'}${Math.abs(d.amount).toFixed(2)})`)
      .join(' | ')
    return `  name:"${name}" | matchField:${v.matchField} | count:${v.count} | total:${v.totalAmount.toFixed(2)} | category:${v.categoryName ?? '(none)'} | payee:${v.payeeName ?? '(none)'} | descriptions: ${descs}`
  })

  return `${sorted.length} already-labelled patterns with no covering rule (sorted by transaction count):\nname | matchField | count | total | category | payee | descriptions\n${lines.join('\n')}`
}

/**
 * Returns project-tagged transactions grouped by payee/description, excluding groups
 * already covered by a rule that sets that workspace. Used to suggest project-assignment rules.
 */
export async function get_project_transactions(
  _userId: string,
  args: { topN?: number; minCount?: number },
  ctx: RulesContext
): Promise<string> {
  const topN = args.topN ?? 15
  const minCount = args.minCount ?? 2

  // Transactions that already have a project assigned
  const projectTxs = ctx.transactions.filter((t) => t.workspaceId != null)

  if (!projectTxs.length) return 'No project-tagged transactions found.'

  // Build a set of (workspaceId) covered by existing rules that set that workspace
  // We use coveredByExisting which is condition-based coverage (no workspace check), so
  // we just show all project-tagged groups — the LLM decides if a rule already exists.

  // Reverse-look up workspace names
  const workspaceIdToName = new Map<string, string>()
  for (const [name, id] of ctx.workspaceMap) {
    workspaceIdToName.set(id, name)
  }

  type Group = {
    count: number
    workspaceName: string
    totalAmount: number
    samples: { desc: string; amount: number }[]
    matchField: 'payeeName' | 'description'
  }
  const groups = new Map<string, Group>()

  for (const tx of projectTxs) {
    const result = extractGroupingKey(tx)
    if (!result) continue
    const { key, matchField } = result
    const wsName = workspaceIdToName.get(tx.workspaceId!) ?? tx.workspaceId!
    const e = groups.get(key) ?? { count: 0, workspaceName: wsName, totalAmount: 0, samples: [], matchField }
    e.count++
    e.totalAmount += tx.amount
    if (e.samples.length < 8) e.samples.push({ desc: tx.description.slice(0, 80), amount: tx.amount })
    groups.set(key, e)
  }

  const sorted = [...groups.entries()]
    .filter(([, v]) => v.count >= minCount)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)

  if (!sorted.length) return `No project-tagged groups with ${minCount}+ transactions found.`

  const lines = sorted.map(([name, v]) => {
    const descs = v.samples
      .map((d) => `${d.desc} (${d.amount < 0 ? '−' : '+'}${Math.abs(d.amount).toFixed(2)})`)
      .join(' | ')
    return `  name:"${name}" | matchField:${v.matchField} | count:${v.count} | total:${v.totalAmount.toFixed(2)} | project:"${v.workspaceName}" | descriptions: ${descs}`
  })

  return `${sorted.length} project-tagged patterns (sorted by transaction count):\nname | matchField | count | total | project | descriptions\n${lines.join('\n')}`
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
    case 'get_ruleless_patterns':
      return get_ruleless_patterns(userId, a as { topN?: number; minCount?: number }, ctx)
    case 'get_project_transactions':
      return get_project_transactions(userId, a as { topN?: number; minCount?: number }, ctx)
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
                      enum: ['description', 'rawDescription', 'payeeName', 'amount', 'accountName', 'currency'],
                      description: 'Transaction field to match. ALWAYS use "description" as the primary condition — it is the most reliable. "rawDescription" is identical to description (same DB column). "payeeName" is secondary and only works if a payee already exists. "currency" is useful for multi-currency books. Do NOT use "date".',
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
                      enum: ['description', 'rawDescription', 'payeeName', 'amount', 'accountName', 'currency'],
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
          workspaceName: {
            type: ['string', 'null'],
            description:
              'Project/workspace name to assign to matched transactions. ONLY set this when the pattern clearly and exclusively belongs to one project (e.g. all "Acme Ltd invoice" transactions belong to the Acme project). Copy the name VERBATIM from the AVAILABLE PROJECTS list. Leave null if the pattern spans multiple projects or if you are not confident.',
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
      name: 'get_ruleless_patterns',
      description:
        'Get transactions that already have a category or payee assigned by the user, but are NOT covered by any existing rule. These are patterns the user has manually labelled — formalising them as rules enables automatic assignment for future transactions. Returns groups sorted by transaction count.',
      parameters: {
        type: 'object',
        properties: {
          topN: {
            type: 'number',
            description: 'Maximum number of groups to return (default 20)',
          },
          minCount: {
            type: 'number',
            description: 'Minimum transactions in a group (default 2)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_transactions',
      description:
        'Get transactions that already have a project/workspace assigned, grouped by payee or description. Use this to identify recurring patterns that should have a project-assignment rule so future transactions are automatically tagged to the right project.',
      parameters: {
        type: 'object',
        properties: {
          topN: {
            type: 'number',
            description: 'Maximum number of groups to return (default 15)',
          },
          minCount: {
            type: 'number',
            description: 'Minimum transactions in a group (default 2)',
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
              'Structured plan listing EVERY group you will emit. Format each as: "merchant → category (payee: PayeeName) [project: ProjectName]" or "merchant → SKIP (reason)". Include [project: X] only when the pattern clearly belongs to one project — omit it otherwise. The execution model copies payee and project names directly from this plan. EVERY named business gets a payee. Only "payee: null" for genuinely ambiguous counterparties. Example: "Spaetkauf → SKIP (ATM). Sharenow → Rideshare (payee: Sharenow). Deliveroo → Meal delivery (payee: Deliveroo). Acme Invoice → Service revenue (payee: Acme Ltd) [project: Acme Ltd]."',
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

// All 21 tools: 14 finance + 7 rules
export const RULES_TOOLS: ToolDefinition[] = [...FINANCE_TOOLS, ...RULES_ONLY_TOOLS]

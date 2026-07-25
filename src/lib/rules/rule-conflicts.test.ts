import { describe, it, expect, beforeEach } from 'vitest'
import {
  detectRuleConflicts,
  groupConflictsByRule,
  type UserRuleLike,
  type ConditionDefLike,
} from './rule-conflicts'

// ── Fixture helpers ───────────────────────────────────────────────────────────

let nextId = 1
function rule(partial: Partial<UserRuleLike> & { conditions: UserRuleLike['conditions'] }): UserRuleLike {
  const id = partial.id ?? `r${nextId++}`
  return {
    id,
    name: partial.name ?? `Rule ${id}`,
    priority: partial.priority ?? 50,
    isActive: partial.isActive ?? true,
    conditions: partial.conditions,
    categoryId: partial.categoryId ?? null,
    categoryName: partial.categoryName ?? null,
    payeeId: partial.payeeId ?? null,
    workspaceId: partial.workspaceId ?? null,
    setNotes: partial.setNotes ?? null,
  }
}

const contains = (field: string, value: string): ConditionDefLike => ({ field, operator: 'contains', value })
const equals = (field: string, value: string): ConditionDefLike => ({ field, operator: 'equals', value })
const num = (operator: string, value: number): ConditionDefLike => ({ field: 'amount', operator, value })

function kinds(conflicts: ReturnType<typeof detectRuleConflicts>): string[] {
  return conflicts.map((c) => c.kind)
}

beforeEach(() => { nextId = 1 })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('detectRuleConflicts', () => {
  it('returns nothing for an empty or single-rule set', () => {
    expect(detectRuleConflicts([])).toEqual([])
    expect(detectRuleConflicts([rule({ conditions: { all: [contains('description', 'amazon')] } })])).toEqual([])
  })

  it('flags duplicate: identical conditions and outputs (later rule only)', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'AMAZON')] }, categoryId: 'c1' })
    const conflicts = detectRuleConflicts([a, b])
    expect(kinds(conflicts)).toEqual(['duplicate'])
    expect(conflicts[0].ruleId).toBe(b.id)
    expect(conflicts[0].otherRuleId).toBe(a.id)
  })

  it('flags conflict: identical conditions, different outputs (both directions)', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c2' })
    const conflicts = detectRuleConflicts([a, b])
    expect(kinds(conflicts)).toEqual(['conflict', 'conflict'])
    expect(conflicts.map((c) => c.ruleId).sort()).toEqual([a.id, b.id].sort())
  })

  it('treats single-def any-group as equal to single-def all-group', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { any: [contains('description', 'amazon')] }, categoryId: 'c1' })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['duplicate'])
  })

  it('flags shadowed: narrower contains shadowed by wider earlier contains', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'amazon prime')] }, categoryId: 'c2' })
    const conflicts = detectRuleConflicts([a, b])
    expect(kinds(conflicts)).toEqual(['shadowed'])
    expect(conflicts[0].ruleId).toBe(b.id)
    expect(conflicts[0].explanation).toContain('never fires')
  })

  it('flags shadowed regardless of priority input order', () => {
    const narrow = rule({ priority: 20, conditions: { all: [contains('description', 'amazon prime')] }, categoryId: 'c2' })
    const wide = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const conflicts = detectRuleConflicts([narrow, wide]) // passed out of order
    expect(kinds(conflicts)).toEqual(['shadowed'])
    expect(conflicts[0].ruleId).toBe(narrow.id)
  })

  it('does NOT shadow when the wider rule runs later — flags possible-overlap instead', () => {
    const narrow = rule({ priority: 10, conditions: { all: [contains('description', 'amazon prime')] }, categoryId: 'c2' })
    const wide = rule({ priority: 20, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const conflicts = detectRuleConflicts([narrow, wide])
    expect(kinds(conflicts)).toEqual(['possible-overlap', 'possible-overlap'])
  })

  it('flags shadowed: equals contained in contains', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] } })
    const b = rule({ priority: 20, conditions: { all: [equals('payeeName', 'Amazon Marketplace')] } })
    // different fields — contains on description cannot contain payeeName equals
    expect(detectRuleConflicts([a, b])).toEqual([])

    const c = rule({ priority: 30, conditions: { all: [contains('payeeName', 'amazon')] } })
    const d = rule({ priority: 40, conditions: { all: [equals('payeeName', 'Amazon Marketplace')] } })
    expect(kinds(detectRuleConflicts([c, d]))).toEqual(['shadowed'])
  })

  it('flags shadowed: narrower amount interval contained in wider', () => {
    const a = rule({ priority: 10, conditions: { all: [num('gt', 50)] }, categoryId: 'big' })
    const b = rule({ priority: 20, conditions: { all: [num('gt', 100), num('lt', 200)] }, categoryId: 'mid' })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['shadowed'])
  })

  it('does not flag disjoint amount ranges', () => {
    const a = rule({ priority: 10, conditions: { all: [num('gte', 100)] } })
    const b = rule({ priority: 20, conditions: { all: [num('lt', 100)] } })
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('flags possible-overlap for intersecting amount ranges with different outputs', () => {
    const a = rule({ priority: 10, conditions: { all: [num('gt', 100)] }, categoryId: 'x' })
    const b = rule({ priority: 20, conditions: { all: [num('gt', 50)] }, categoryId: 'y' })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['possible-overlap', 'possible-overlap'])
  })

  it('does not flag unrelated keywords (noise control)', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'rent')] } })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'spotify')] } })
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('does not flag rules on entirely different fields', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] } })
    const b = rule({ priority: 20, conditions: { all: [equals('payeeName', 'Amazon')] } })
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('does not flag provably disjoint equals values', () => {
    const a = rule({ priority: 10, conditions: { all: [equals('payeeName', 'amazon')] } })
    const b = rule({ priority: 20, conditions: { all: [equals('payeeName', 'ebay')] } })
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('flags possible-overlap (not shadowed) for regex conditions', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [{ field: 'description', operator: 'regex', value: '^amazon' }] }, categoryId: 'c2' })
    const conflicts = detectRuleConflicts([a, b])
    expect(kinds(conflicts)).toEqual(['possible-overlap', 'possible-overlap'])
  })

  it('is conservative with multi-def any groups: possible-overlap, never shadowed', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { any: [contains('description', 'amazon prime'), contains('description', 'aws')] }, categoryId: 'c2' })
    const conflicts = detectRuleConflicts([a, b])
    expect(kinds(conflicts)).toEqual(['possible-overlap', 'possible-overlap'])
  })

  it('flags shadowed: oneOf subset', () => {
    const a = rule({ priority: 10, conditions: { all: [{ field: 'description', operator: 'oneOf', value: ['amazon', 'ebay', 'etsy'] }] } })
    const b = rule({ priority: 20, conditions: { all: [{ field: 'description', operator: 'oneOf', value: ['amazon', 'ebay'] }] } })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['shadowed'])
  })

  it('does not flag disjoint oneOf sets', () => {
    const a = rule({ priority: 10, conditions: { all: [{ field: 'description', operator: 'oneOf', value: ['amazon', 'ebay'] }] } })
    const b = rule({ priority: 20, conditions: { all: [{ field: 'description', operator: 'oneOf', value: ['spotify', 'netflix'] }] } })
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('multi-condition shadow: all of A\u2019s terms must be implied by B', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon'), num('gt', 10)] }, categoryId: 'c1' })
    const contained = rule({ priority: 20, conditions: { all: [contains('description', 'amazon prime'), num('gt', 50)] }, categoryId: 'c2' })
    expect(kinds(detectRuleConflicts([a, contained]))).toEqual(['shadowed'])

    const notContained = rule({ priority: 20, conditions: { all: [contains('description', 'amazon prime'), num('gt', 5)] }, categoryId: 'c2' })
    // amount gt 5 is wider than gt 10 → not contained → but both pairs related → possible-overlap
    expect(kinds(detectRuleConflicts([a, notContained]))).toEqual(['possible-overlap', 'possible-overlap'])
  })

  it('no shadow when A constrains a field B does not mention', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon'), num('gt', 100)] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'amazon prime')] }, categoryId: 'c2' })
    // B matches small amounts which A wouldn't catch → B can fire → no shadow;
    // keywords related → possible-overlap
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['possible-overlap', 'possible-overlap'])
  })

  it('ignores inactive rules', () => {
    const a = rule({ priority: 10, isActive: false, conditions: { all: [contains('description', 'amazon')] } })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'amazon prime')] } })
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('compares categoryName case-insensitively when categoryId is missing', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryName: 'Shopping' })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'amazon')] }, categoryName: 'shopping' })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['duplicate'])
  })

  it('different payee outputs with same conditions → conflict', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, payeeId: 'p1' })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'amazon')] }, payeeId: 'p2' })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['conflict', 'conflict'])
  })

  it('starts_with wider shadows starts_with narrower; unrelated prefixes are disjoint', () => {
    const a = rule({ priority: 10, conditions: { all: [{ field: 'description', operator: 'starts_with', value: 'amazon' }] } })
    const b = rule({ priority: 20, conditions: { all: [{ field: 'description', operator: 'starts_with', value: 'amazon prime' }] } })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['shadowed'])

    const c = rule({ priority: 10, conditions: { all: [{ field: 'description', operator: 'starts_with', value: 'amazon' }] } })
    const d = rule({ priority: 20, conditions: { all: [{ field: 'description', operator: 'starts_with', value: 'amex' }] } })
    expect(detectRuleConflicts([c, d])).toEqual([])
  })

  it('between is contained in a wider gte', () => {
    const a = rule({ priority: 10, conditions: { all: [num('gte', 0)] } })
    const b = rule({ priority: 20, conditions: { all: [{ field: 'amount', operator: 'between', value: [10, 20] }] } })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['shadowed'])
  })

  // ── Noise-control fixes ─────────────────────────────────────────────────────

  it('not_contains does NOT auto-flag possible-overlap against unrelated rules', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'uber')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'spotify'), { field: 'description', operator: 'not_contains', value: 'ads' }] }, categoryId: 'c2' })
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('not_contains narrows a rule but does not create overlap noise with the wider rule', () => {
    const narrow = rule({ priority: 10, conditions: { all: [contains('description', 'uber eats')] }, categoryId: 'c1' })
    const wide = rule({ priority: 20, conditions: { all: [contains('description', 'uber'), { field: 'description', operator: 'not_contains', value: 'uber eats' }] }, categoryId: 'c2' })
    // "uber" is only 4 chars → below MIN_SUBSTRING_LEN → no possible-overlap from
    // the substring check. The not_contains term is a filter → returns false.
    // No shadow either (wide runs later). Net: no conflict.
    expect(detectRuleConflicts([narrow, wide])).toEqual([])
  })

  it('regex only flags possible-overlap when the other keyword appears in the pattern', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [{ field: 'description', operator: 'regex', value: '^amazon' }] }, categoryId: 'c2' })
    expect(kinds(detectRuleConflicts([a, b]))).toEqual(['possible-overlap', 'possible-overlap'])

    const c = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const d = rule({ priority: 20, conditions: { all: [{ field: 'description', operator: 'regex', value: '^\\d{4}$' }] }, categoryId: 'c2' })
    expect(detectRuleConflicts([c, d])).toEqual([])
  })

  it('two regex conditions against each other do not flag possible-overlap', () => {
    const a = rule({ priority: 10, conditions: { all: [{ field: 'description', operator: 'regex', value: '^amazon' }] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [{ field: 'description', operator: 'regex', value: '^ebay' }] }, categoryId: 'c2' })
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('short shared substring (< 6 chars) does NOT flag possible-overlap with any groups', () => {
    const a = rule({ priority: 10, conditions: { any: [contains('description', 'exxon'), contains('description', 'mobil')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { any: [contains('description', 't-mobile'), contains('description', 'tmobile')] }, categoryId: 'c2' })
    // "mobil" (5 chars) ⊂ "tmobile" but below MIN_SUBSTRING_LEN; multi-def any
    // groups can't be proven for shadow → previously auto-flagged, now skipped.
    expect(detectRuleConflicts([a, b])).toEqual([])
  })

  it('substring at exactly 6 chars still flags possible-overlap (narrower first)', () => {
    const narrow = rule({ priority: 10, conditions: { all: [contains('description', 'amazon prime')] }, categoryId: 'c1' })
    const wide = rule({ priority: 20, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c2' })
    // "amazon" is exactly 6 chars → still flags. Narrower runs first → no shadow.
    expect(kinds(detectRuleConflicts([narrow, wide]))).toEqual(['possible-overlap', 'possible-overlap'])
  })

  it('same category with different payees does NOT flag possible-overlap (any groups)', () => {
    const generic = rule({ priority: 10, conditions: { any: [contains('description', 'restaurant'), contains('description', 'bistro')] }, categoryId: 'c1' })
    const specific = rule({ priority: 20, conditions: { any: [contains('description', 'Courthouse Restaurant')] }, categoryId: 'c1', payeeId: 'p1' })
    // Multi-def any groups → can't prove shadow. categoriesMatch → skip possible-overlap.
    expect(detectRuleConflicts([generic, specific])).toEqual([])
  })

  it('same category — narrower all-group shadowed by wider all-group (still flagged)', () => {
    const wide = rule({ priority: 10, conditions: { all: [contains('description', 'restaurant')] }, categoryId: 'c1' })
    const narrow = rule({ priority: 20, conditions: { all: [contains('description', 'restaurant pirosmani')] }, categoryId: 'c1', payeeId: 'p1' })
    // Shadow detection still fires — categoriesMatch only skips possible-overlap.
    expect(kinds(detectRuleConflicts([wide, narrow]))).toEqual(['shadowed'])
  })

  it('different categories with overlapping keywords still flag possible-overlap (narrower first)', () => {
    const narrow = rule({ priority: 10, conditions: { all: [contains('description', 'amazon warehouse')] }, categoryId: 'c1' })
    const wide = rule({ priority: 20, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c2' })
    // Narrower first → no shadow. Different categories → categoriesMatch false. → possible-overlap.
    expect(kinds(detectRuleConflicts([narrow, wide]))).toEqual(['possible-overlap', 'possible-overlap'])
  })
})

describe('groupConflictsByRule', () => {
  it('groups conflicts under their rule id', () => {
    const a = rule({ priority: 10, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c1' })
    const b = rule({ priority: 20, conditions: { all: [contains('description', 'amazon')] }, categoryId: 'c2' })
    const map = groupConflictsByRule(detectRuleConflicts([a, b]))
    expect(map.get(a.id)).toHaveLength(1)
    expect(map.get(b.id)).toHaveLength(1)
    expect(map.get(a.id)![0].otherRuleId).toBe(b.id)
  })
})

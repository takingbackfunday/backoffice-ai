// Pure, conservative conflict detection for categorization rules.
//
// Rules are evaluated priority-ascending, first match wins. Given a user's
// rules, this module flags four relationships:
//
//   duplicate        — identical conditions, identical outputs (redundant)
//   conflict         — identical conditions, different outputs (later rule never fires)
//   shadowed         — a later rule's matches are fully contained in an earlier rule's
//   possible-overlap — conditions may overlap with different outputs, but we can't
//                      prove containment (soft warning; never blocks saving)
//
// Detection is deliberately conservative: `regex` only flags when the other
// condition's keyword appears in the pattern; `not_*` operators are treated as
// filters (they don't establish overlap); multi-condition `any` groups can't be
// proven for shadowing so they only produce `possible-overlap` (when the two
// rules share a field and have different outputs). Substring matching requires
// the shorter keyword to be ≥ 6 chars to avoid noise. Rules that share no
// condition field are never flagged. Rules that set the same category are not
// flagged for possible-overlap (the generic→specific override is intentional).

export interface ConditionDefLike {
  field: string
  operator: string
  value: string | number | string[] | [number, number]
}

export interface RuleConditionsLike {
  all?: ConditionDefLike[]
  any?: ConditionDefLike[]
}

export interface UserRuleLike {
  id: string
  name: string
  priority: number
  isActive: boolean
  conditions: RuleConditionsLike
  categoryId?: string | null
  categoryName?: string | null
  payeeId?: string | null
  workspaceId?: string | null
  setNotes?: string | null
}

export type RuleConflictKind = 'duplicate' | 'conflict' | 'shadowed' | 'possible-overlap'

export interface RuleConflict {
  kind: RuleConflictKind
  /** The rule the warning is attached to. */
  ruleId: string
  /** The other rule involved in the relationship. */
  otherRuleId: string
  otherRuleName: string
  otherRulePriority: number
  explanation: string
}

// ── Normalization (exact equality) ────────────────────────────────────────────

function normScalar(v: string | number): string {
  return typeof v === 'number' ? `#${v}` : v.toLowerCase()
}

function normValue(v: ConditionDefLike['value']): string {
  if (Array.isArray(v)) return v.map((x) => normScalar(x as string | number)).sort().join('|')
  return normScalar(v)
}

function normOp(op: string): string {
  return op === 'in' ? 'oneOf' : op
}

function normDef(d: ConditionDefLike): string {
  return `${d.field}:${normOp(d.operator)}:${normValue(d.value)}`
}

/** Stable canonical form — single-def `all` and `any` groups are equivalent. */
function canonicalConditions(c: RuleConditionsLike): string {
  const group = c.all ?? c.any ?? []
  const kind = group.length === 1 ? 'single' : c.all ? 'all' : 'any'
  return `${kind}(${group.map(normDef).sort().join(',')})`
}

// ── Outputs ───────────────────────────────────────────────────────────────────

function categoryKey(r: UserRuleLike): string | null {
  if (r.categoryId) return `id:${r.categoryId}`
  if (r.categoryName) return `name:${r.categoryName.toLowerCase()}`
  return null
}

function outputsEqual(a: UserRuleLike, b: UserRuleLike): boolean {
  return (
    categoryKey(a) === categoryKey(b) &&
    (a.payeeId ?? null) === (b.payeeId ?? null) &&
    (a.workspaceId ?? null) === (b.workspaceId ?? null) &&
    (a.setNotes ?? null) === (b.setNotes ?? null)
  )
}

/** Both rules set the same category — the generic→specific override is intentional. */
function categoriesMatch(a: UserRuleLike, b: UserRuleLike): boolean {
  return categoryKey(a) !== null && categoryKey(a) === categoryKey(b)
}

// ── Condition group helpers ───────────────────────────────────────────────────

interface Group { kind: 'all' | 'any'; defs: ConditionDefLike[] }

function groupOf(r: UserRuleLike): Group {
  if (r.conditions.all) return { kind: 'all', defs: r.conditions.all }
  return { kind: 'any', defs: r.conditions.any ?? [] }
}

/** Multi-def `any` groups can't be reasoned about conjunctively. */
function isConjunctive(g: Group): boolean {
  return g.kind === 'all' || g.defs.length <= 1
}

const NUMERIC_FIELDS = new Set(['amount'])

// ── Numeric intervals ─────────────────────────────────────────────────────────

interface Interval { lo: number; loInc: boolean; hi: number; hiInc: boolean }

const OPEN_TOP: Interval = { lo: -Infinity, loInc: false, hi: Infinity, hiInc: false }

function defInterval(d: ConditionDefLike): Interval | null {
  const n = Number(d.value)
  switch (normOp(d.operator)) {
    case 'gt':      return Number.isNaN(n) ? null : { lo: n, loInc: false, hi: Infinity, hiInc: false }
    case 'gte':     return Number.isNaN(n) ? null : { lo: n, loInc: true, hi: Infinity, hiInc: false }
    case 'lt':      return Number.isNaN(n) ? null : { lo: -Infinity, loInc: false, hi: n, hiInc: false }
    case 'lte':     return Number.isNaN(n) ? null : { lo: -Infinity, loInc: false, hi: n, hiInc: true }
    case 'equals':  return Number.isNaN(n) ? null : { lo: n, loInc: true, hi: n, hiInc: true }
    case 'between': {
      if (!Array.isArray(d.value) || d.value.length !== 2) return null
      const [a, b] = [Number(d.value[0]), Number(d.value[1])]
      if (Number.isNaN(a) || Number.isNaN(b)) return null
      return { lo: Math.min(a, b), loInc: true, hi: Math.max(a, b), hiInc: true }
    }
    default:        return null // non-numeric operators on a numeric field — unprovable
  }
}

function intervalEmpty(i: Interval): boolean {
  return i.lo > i.hi || (i.lo === i.hi && !(i.loInc && i.hiInc))
}

function intersect(a: Interval, b: Interval): Interval {
  let lo = Math.max(a.lo, b.lo)
  let loInc = a.lo === b.lo ? a.loInc && b.loInc : a.lo > b.lo ? a.loInc : b.loInc
  let hi = Math.min(a.hi, b.hi)
  let hiInc = a.hi === b.hi ? a.hiInc && b.hiInc : a.hi < b.hi ? a.hiInc : b.hiInc
  if (intervalEmpty({ lo, loInc, hi, hiInc })) {
    // canonical empty interval
    lo = 1; hi = 0; loInc = true; hiInc = true
  }
  return { lo, loInc, hi, hiInc }
}

function intervalContains(outer: Interval, inner: Interval): boolean {
  const loOk = outer.lo < inner.lo || (outer.lo === inner.lo && (outer.loInc || !inner.loInc))
  const hiOk = outer.hi > inner.hi || (outer.hi === inner.hi && (outer.hiInc || !inner.hiInc))
  return loOk && hiOk
}

// ── Text values ───────────────────────────────────────────────────────────────

function textVal(d: ConditionDefLike): string {
  return Array.isArray(d.value) ? d.value.map(String).join(',').toLowerCase() : String(d.value).toLowerCase()
}

function listVal(d: ConditionDefLike): string[] {
  return (Array.isArray(d.value) ? d.value.map(String) : [String(d.value)]).map((s) => s.toLowerCase())
}

/** Matching `b` provably implies matching `a` (same field assumed). */
function defImplies(b: ConditionDefLike, a: ConditionDefLike): boolean {
  const ao = normOp(a.operator)
  const bo = normOp(b.operator)
  switch (ao) {
    case 'contains':
      if (bo === 'contains' || bo === 'equals' || bo === 'starts_with') return textVal(b).includes(textVal(a))
      if (bo === 'oneOf') { const l = listVal(b); return l.length > 0 && l.every((s) => s.includes(textVal(a))) }
      return false
    case 'equals':
      if (bo === 'equals') return textVal(a) === textVal(b)
      if (bo === 'oneOf') { const l = listVal(b); return l.length === 1 && l[0] === textVal(a) }
      return false
    case 'starts_with':
      if (bo === 'starts_with' || bo === 'equals') return textVal(b).startsWith(textVal(a))
      return false
    case 'ends_with':
      if (bo === 'ends_with' || bo === 'equals') return textVal(b).endsWith(textVal(a))
      return false
    case 'oneOf': {
      const al = listVal(a)
      if (bo === 'oneOf') return listVal(b).every((s) => al.includes(s))
      if (bo === 'equals') return al.includes(textVal(b))
      return false
    }
    default:
      return false // not_*, regex, includes/excludes — unprovable
  }
}

/** Two conditions (same field) can never match the same value. */
function disjointPair(a: ConditionDefLike, b: ConditionDefLike): boolean {
  if (NUMERIC_FIELDS.has(a.field)) {
    const ai = defInterval(a)
    const bi = defInterval(b)
    if (!ai || !bi) return false
    return intervalEmpty(intersect(ai, bi))
  }
  const ao = normOp(a.operator)
  const bo = normOp(b.operator)
  const av = textVal(a)
  const bv = textVal(b)

  if (ao === 'equals' && bo === 'equals') return av !== bv
  if (ao === 'equals' && bo === 'contains') return !av.includes(bv)
  if (bo === 'equals' && ao === 'contains') return !bv.includes(av)
  if (ao === 'equals' && bo === 'starts_with') return !av.startsWith(bv)
  if (bo === 'equals' && ao === 'starts_with') return !bv.startsWith(av)
  if (ao === 'equals' && bo === 'ends_with') return !av.endsWith(bv)
  if (bo === 'equals' && ao === 'ends_with') return !bv.endsWith(av)
  if (ao === 'starts_with' && bo === 'starts_with') return !av.startsWith(bv) && !bv.startsWith(av)
  if (ao === 'ends_with' && bo === 'ends_with') return !av.endsWith(bv) && !bv.endsWith(av)
  if (ao === 'equals' && bo === 'oneOf') return !listVal(b).includes(av)
  if (bo === 'equals' && ao === 'oneOf') return !listVal(a).includes(bv)
  if (ao === 'oneOf' && bo === 'oneOf') return listVal(a).every((s) => !listVal(b).includes(s))
  if (ao === 'oneOf' && bo === 'contains') return listVal(a).every((s) => !s.includes(bv))
  if (bo === 'oneOf' && ao === 'contains') return listVal(b).every((s) => !s.includes(av))
  if (ao === 'oneOf' && bo === 'starts_with') return listVal(a).every((s) => !s.startsWith(bv))
  if (bo === 'oneOf' && ao === 'starts_with') return listVal(b).every((s) => !s.startsWith(av))
  if (ao === 'oneOf' && bo === 'ends_with') return listVal(a).every((s) => !s.endsWith(bv))
  if (bo === 'oneOf' && ao === 'ends_with') return listVal(b).every((s) => !s.endsWith(av))
  return false
}

/** Negation operators restrict the match set — they don't establish overlap. */
const NEGATION_OPS = new Set(['not_contains', 'not_equals', 'excludes'])

/** Minimum keyword length for substring-based overlap flagging. */
const MIN_SUBSTRING_LEN = 6

/**
 * Two conditions (same field) look like they could match the same transaction.
 * Only "related" keywords count — `contains "rent"` vs `contains "spotify"` is
 * not flagged, otherwise every pair of description rules would warn.
 *
 * Noise-control measures:
 * - Negation operators (not_contains, not_equals, excludes) return false — they
 *   are filters, not matchers, and don't contribute to overlap.
 * - regex only flags when the other condition's keyword literally appears in
 *   the pattern string; two regexes against each other are skipped entirely.
 * - Substring matching requires the shorter keyword to be ≥ MIN_SUBSTRING_LEN
 *   characters, avoiding false positives like "mobil" ⊂ "tmobile".
 */
function relatedPair(a: ConditionDefLike, b: ConditionDefLike): boolean {
  if (NUMERIC_FIELDS.has(a.field)) {
    const ai = defInterval(a)
    const bi = defInterval(b)
    if (!ai || !bi) return true // unprovable numeric op — soft-flag
    return !intervalEmpty(intersect(ai, bi))
  }
  if (disjointPair(a, b)) return false
  const ao = normOp(a.operator)
  const bo = normOp(b.operator)
  // Negation operators are filters, not matchers — they restrict the match set
  // and don't establish that two rules overlap.
  if (NEGATION_OPS.has(ao) || NEGATION_OPS.has(bo)) return false
  const av = textVal(a)
  const bv = textVal(b)
  // regex: only flag if the other condition's keyword literally appears in the
  // pattern. Two regexes against each other are unprovable — skip.
  if (ao === 'regex' || bo === 'regex') {
    if (ao === 'regex' && bo === 'regex') return false
    const regexVal = ao === 'regex' ? av : bv
    const otherVal = ao === 'regex' ? bv : av
    return otherVal.length > 0 && regexVal.includes(otherVal)
  }
  // substring/prefix/suffix relations — only when the shorter keyword is long
  // enough to be meaningful (avoids "mobil" ⊂ "tmobile" false positives).
  const shorter = av.length <= bv.length ? av : bv
  const longer = av.length <= bv.length ? bv : av
  if (shorter.length >= MIN_SUBSTRING_LEN && longer.includes(shorter)) return true
  // oneOf vs a string op: some member related (not disjoint, checked above)
  if (ao === 'oneOf' || bo === 'oneOf') return true
  return false
}

// ── Relationship checks ───────────────────────────────────────────────────────

/** Every transaction matching B also matches A (both conjunctive). */
function shadows(a: UserRuleLike, b: UserRuleLike): boolean {
  const ga = groupOf(a)
  const gb = groupOf(b)
  if (!isConjunctive(ga) || !isConjunctive(gb)) return false
  if (ga.defs.length === 0 || gb.defs.length === 0) return false
  return ga.defs.every((ad) => {
    const sameField = gb.defs.filter((bd) => bd.field === ad.field)
    if (sameField.length === 0) return false
    if (NUMERIC_FIELDS.has(ad.field)) {
      const ai = defInterval(ad)
      if (!ai) return false
      let combined: Interval = OPEN_TOP
      for (const bd of sameField) {
        const bi = defInterval(bd)
        if (!bi) return false
        combined = intersect(combined, bi)
        if (intervalEmpty(combined)) return true // B matches nothing ⇒ vacuously contained
      }
      return intervalContains(ai, combined)
    }
    return sameField.some((bd) => defImplies(bd, ad))
  })
}

/** The two rules' match sets are provably disjoint. */
function provablyDisjoint(a: UserRuleLike, b: UserRuleLike): boolean {
  const ga = groupOf(a)
  const gb = groupOf(b)
  if (ga.defs.length === 0 || gb.defs.length === 0) return false
  const pairDisjoint = (x: ConditionDefLike, y: ConditionDefLike) => x.field === y.field && disjointPair(x, y)
  const aAll = isConjunctive(ga)
  const bAll = isConjunctive(gb)
  if (aAll && bAll) return ga.defs.some((x) => gb.defs.some((y) => pairDisjoint(x, y)))
  if (aAll) return gb.defs.every((y) => ga.defs.some((x) => pairDisjoint(x, y)))
  if (bAll) return ga.defs.every((x) => gb.defs.some((y) => pairDisjoint(x, y)))
  return ga.defs.every((x) => gb.defs.every((y) => pairDisjoint(x, y)))
}

/** At least one same-field pair looks related (or unprovable). */
function hasRelatedPair(a: UserRuleLike, b: UserRuleLike): boolean {
  const ga = groupOf(a)
  const gb = groupOf(b)
  return ga.defs.some((x) => gb.defs.some((y) => x.field === y.field && relatedPair(x, y)))
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function detectRuleConflicts(rules: UserRuleLike[]): RuleConflict[] {
  const active = rules.filter((r) => r.isActive).slice().sort((x, y) => x.priority - y.priority)
  const conflicts: RuleConflict[] = []
  const seen = new Set<string>()

  function push(kind: RuleConflictKind, rule: UserRuleLike, other: UserRuleLike, explanation: string) {
    const key = `${kind}:${rule.id}:${other.id}`
    if (seen.has(key)) return
    seen.add(key)
    conflicts.push({
      kind,
      ruleId: rule.id,
      otherRuleId: other.id,
      otherRuleName: other.name,
      otherRulePriority: other.priority,
      explanation,
    })
  }

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const earlier = active[i]
      const later = active[j]

      if (canonicalConditions(earlier.conditions) === canonicalConditions(later.conditions)) {
        if (outputsEqual(earlier, later)) {
          push('duplicate', later, earlier,
            `"${later.name}" is redundant — identical to "${earlier.name}" (priority ${earlier.priority}), which runs first`)
        } else {
          push('conflict', later, earlier,
            `"${later.name}" never fires — "${earlier.name}" (priority ${earlier.priority}) has the same conditions but different actions`)
          push('conflict', earlier, later,
            `"${earlier.name}" hides "${later.name}" (priority ${later.priority}) — same conditions, different actions`)
        }
        continue
      }

      if (shadows(earlier, later)) {
        push('shadowed', later, earlier,
          `"${later.name}" never fires — "${earlier.name}" (priority ${earlier.priority}) matches the same transactions first`)
        continue
      }

      if (provablyDisjoint(earlier, later)) continue
      if (outputsEqual(earlier, later)) continue
      if (categoriesMatch(earlier, later)) continue
      if (!hasRelatedPair(earlier, later)) continue

      push('possible-overlap', later, earlier,
        `"${later.name}" may overlap with "${earlier.name}" (priority ${earlier.priority}) — the first matching rule wins`)
      push('possible-overlap', earlier, later,
        `"${earlier.name}" may overlap with "${later.name}" (priority ${later.priority}) — the first matching rule wins`)
    }
  }

  return conflicts
}

/** Group conflicts by the rule they attach to. */
export function groupConflictsByRule(conflicts: RuleConflict[]): Map<string, RuleConflict[]> {
  const map = new Map<string, RuleConflict[]>()
  for (const c of conflicts) {
    const list = map.get(c.ruleId)
    if (list) list.push(c)
    else map.set(c.ruleId, [c])
  }
  return map
}

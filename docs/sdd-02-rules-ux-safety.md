# SDD-02 — Rules UX, Explicit Payee Creation, AI Opt-in & Conflict Warnings

Status: Draft · Date: 2026-07-24 · PRD: `prd-02-rules-ux-safety.md` · Effort: L (5–8 days)

## Current-state facts (verified)

- Rule editor category picker: plain grouped `<select>` (`rule-editor.tsx:453-463`),
  category id as value; free-text fallback when no groups.
- Rule editor payee: free-text `<input list="payee-suggestions">` + `<datalist>`
  (`rule-editor.tsx:436-446`); raw string sent as `payeeName`.
- Server implicit creation: `POST /api/rules` upserts payee by name
  (`src/app/api/rules/route.ts:80-89`); same in `PATCH /api/rules/[id]`
  (`[id]/route.ts:56-69`). Upsert key is case-sensitive `userId_name`.
- Transactions page comboboxes: `category-cell.tsx` (type-ahead over name+group,
  keyboard nav, PortalDropdown) and `payee-cell.tsx` (same + explicit
  `+ Create "X"` row).
- Engine: `evaluateRules(fact, rules, 'first')` — priority-asc, first match wins
  (`src/lib/rules/engine.ts:11-27`); all production call sites use `'first'`.
  Conditions: `{ all?: ConditionDef[] }` xor `{ any?: ConditionDef[] }`;
  `matchesConditions` in `evaluate-condition.ts`; string ops case-insensitive.
- AI triggers: import route enqueues `rules-agent` unconditionally
  (`src/app/api/transactions/import/route.ts:113`); post-edit mini-agent fired
  unconditionally (`use-inline-edit.ts:52-63`, 30s debounce); manual run via
  `GET /api/agent/rules` (budget + 30s cooldown only). Suggestions surface in
  `rules-manager.tsx:509-570` + `rules-agent.tsx`.
- No conflict detection exists anywhere (`grep contradict|conflict|overlap` = 0).
- Both `rule-editor.tsx` (720) and `rules-manager.tsx` (737) exceed the 400-line cap.

## Design

### A. Shared combobox primitives (R2, R3)

Extract from `category-cell.tsx` / `payee-cell.tsx` into reusable leaves:

```
src/components/ui/category-combobox.tsx   // groups, value(id|null), onCommit, optional LLM scoring
src/components/ui/payee-combobox.tsx      // payees, value(name), onCommit(id|null), explicit create row
```

- `CategoryCombobox`: props `{ groups, value, onCommit(id|null), autoFocus?, context? }`.
  `context = { description?, payeeName?, amount? }` optional — when provided, fires
  `POST /api/llm/suggest-category` for confidence badges (transactions cell passes
  it; rule editor omits it — no LLM call in the editor).
- `PayeeCombobox`: props `{ payees, value, onCommit(payeeId|null), onCreatePayee(name) }`.
  Renders the green `+ Create "X"` row only when `draft` has no exact
  case-insensitive match. Creation is always an explicit click/Enter on that row.
- Both use `PortalDropdown` + `usePortalOutsideClick` (SDD-01 hook), keyboard
  nav (↑↓/Enter/Esc), and the open-state fix from SDD-01 (open on mousedown,
  initial open only when `autoFocus`).
- `category-cell.tsx` / `payee-cell.tsx` are rebased onto these primitives —
  keeps one implementation, shrinks both cells.

### B. Rule editor integration + decomposition (R2, R3, R5)

Split `rule-editor.tsx` (720 → ~300):

```
src/components/rules/rule-editor.tsx            // form shell, save logic
src/components/rules/condition-row.tsx          // moved (exported today)
src/components/rules/output-row.tsx             // moved; uses the two comboboxes
src/components/rules/live-preview.tsx           // moved
src/components/rules/rule-conflict-banner.tsx   // new (section C)
```

`OutputRow` changes:

- Category action: `<CategoryCombobox groups={categoryGroups} value={action.value}
  onCommit={(id) => onChange({ ...action, value: id ?? '' })} />`. Keep the
  free-text fallback only when `categoryGroups.length === 0` (no categories seeded).
- Payee action: `<PayeeCombobox>`; on explicit create: `POST /api/payees` → append
  to local payees state → set action value to the created id. Payee output value
  becomes an **id**, not a name string. Track the display name alongside for
  rendering (existing payees prop provides it).
- Save payload (`rule-editor.tsx:556,598`): send `payeeId` (string|null). Stop
  sending raw `payeeName` from the editor.

### C. Rules API: explicit payee contract (R3)

`src/app/api/rules/route.ts` + `src/app/api/rules/[id]/route.ts`:

- Accept `payeeId: z.string().nullable().optional()`; verify ownership
  (`payee.findFirst({ where: { id, userId } })`) → 400 on foreign id.
- `payeeName` handling: keep the field for backward compat (rules-agent
  suggestion acceptance at `suggestions/[id]/route.ts:38-61` sends names), but
  replace silent upsert with **resolve-or-reject**:
  `findFirst({ where: { userId, name: { equals: payeeName, mode: 'insensitive' } } })`
  → use its id; not found → 400 `"Unknown payee '<name>'. Create it first."`
- Net effect: no code path creates a Payee except `POST /api/payees`.
- `POST /api/payees`: add case-insensitive pre-check → 409 `{ data: existing }`
  (shared with SDD-01; one `conflict()` helper in `src/lib/api-response.ts`).
- Agent validator note: `rules-tools.ts` already rejects payee-only conditions and
  validates against known payees, so resolve-or-reject doesn't change agent
  behavior — agent-suggested payees exist by construction. If a suggestion
  references a since-deleted payee, acceptance now 400s — acceptable, surfaces
  instead of silently creating.

### D. Conflict detection module (R1)

New pure module `src/lib/rules/rule-conflicts.ts` (+ colocated tests):

```ts
export type RuleConflictKind = 'duplicate' | 'conflict' | 'shadowed' | 'possible-overlap'
export interface RuleConflict {
  kind: RuleConflictKind
  ruleId: string
  otherRuleId: string
  explanation: string   // human-readable, e.g. '"amazon prime" never fires — "amazon" (priority 10) matches it first'
}
export function detectRuleConflicts(rules: UserRuleLike[]): RuleConflict[]
```

`UserRuleLike = { id, name, priority, isActive, conditions, categoryId?, payeeId?, workspaceId?, setNotes? }`
(align with `CategorizationRule` + editor's `UserRule` type).

Algorithm (O(n²) over active rules — fine at expected volumes):

1. Sort by priority asc. For each ordered pair (A earlier, B later):
2. **Normalize + compare conditions:**
   - `normalizeConditions(conditions)`: lowercase string values, sort defs within
     `all`/`any`, stable stringify → hash for exact equality.
   - Equal hashes: outputs equal → `duplicate`; outputs differ → `conflict`.
3. **Containment (shadow):** B is shadowed by A if every fact matching B also
   matches A. Conservative checks per field (AND groups only):
   - Same field `contains x` ⊇ `contains y` iff `y.includes(x)`.
   - `equals v` ⊆ `contains x` iff `v.includes(x)`; two `equals` disjoint iff v₁≠v₂.
   - Amount `gt/gte/lt/lte/between`: interval intersection/containment math.
   - Mixed/unknown (`regex`, `not_*`, `oneOf`, `any` groups): not provable → skip.
   - A provably "wider" for every AND-term in B ⇒ `shadowed`. Note the subtlety:
     shadowing holds even if A sets different/no outputs — first match wins, so B
     never fires regardless.
4. **Overlap (conflict):** if not equal and not contained, check pairwise term
   compatibility across same fields; if no terms are provably disjoint and outputs
   differ → `possible-overlap` (soft warning). If any same-field pair is provably
   disjoint (`equals a` vs `equals b`, a≠b; non-intersecting amount ranges) → no
   relation.
5. **Outputs differ** = any of categoryId / payeeId / workspaceId / setNotes differ.

Surfaces:

- **Client (list + save-time):** `rules-manager.tsx` already holds the full rule
  list — run `detectRuleConflicts` in a `useMemo`, group by ruleId, render badges
  in the list and pass conflicts for the editing rule into `RuleEditor` →
  `rule-conflict-banner.tsx` ("⚠ Overlaps with 'Groceries' (priority 20) — the
  first matching rule wins. Save anyway?"). Zero new API surface.
- **Server (defense in depth):** `POST/PATCH /api/rules` loads the user's active
  rules, runs the same module with the candidate rule appended, and returns
  `{ data, meta: { conflicts } }` — the editor displays these if it skipped the
  client check (e.g. agent-driven creation). Never blocks the write.

Tests (`rule-conflicts.test.ts`): fixtures for each kind, the substring/interval
matrix, `any`-group conservatism, priority ordering, inactive rules ignored.

### E. AI suggestions opt-in (R4)

Preference: add `aiRuleSuggestions?: boolean` to `UserPreferenceData`
(`src/types/preferences.ts`) — absent = off. No migration (JSON column).

Gate points (server-authoritative; client mirrors for UX):

1. `src/lib/agent/run-rules-agent.ts` — `runRulesAgentInBackground` already loads
   preferences (line ~389): early-return `{ skipped: true }` when not opted in.
   Single choke point covering the import enqueue and any future callers. (The
   import route's `enqueueJob` stays — cheap no-op job; simpler than threading
   prefs into the import route, and jobs table records the skip.)
2. `src/app/api/rules/suggest-from-edits/route.ts` — early `{ count: 0 }` when off.
3. `src/app/api/agent/rules/route.ts` (SSE) — return an error event + 403 when off.
4. Client mirrors: `use-inline-edit.ts` skips the `fireSuggestions` fetch when the
   pref is off (transactions page needs the pref — fetch once with the prefs it
   likely already loads; confirm at implementation, else `GET /api/preferences`
   once on mount). `rules/page.tsx` (server) reads the pref and passes
   `aiSuggestionsEnabled` to `RulesManager`: hide banner (`:509`), disable
   "Run rules agent" (`:444-449`), ignore `?agent=1` (`:190,210`). Server-side
   `ruleSuggestion.findMany` stays (cheap) but banner render is gated.
5. Settings UI: new "AI features" section in `payment-settings-form.tsx` (or a
   sibling `ai-features-form.tsx` — watch the 400-line cap; the form is at 323)
   with a checkbox POSTing `{ aiRuleSuggestions: true|false }` to
   `/api/preferences`. Copy: "Suggest categorization rules from my edits and
   imports. Uses AI; can be turned off anytime."
6. Rules page empty-state nudge when off (dismissible, copy per PRD) — small,
   client-side, not persisted (or persist dismissal in prefs as
   `aiSuggestionsNudgeDismissed` if trivial).

### F. Component-size budget

| File | Before | After (est.) |
|---|---|---|
| `rule-editor.tsx` | 720 | ~300 (extract rows/preview/banner) |
| `rules-manager.tsx` | 737 | ~700 (badges + pref gate; further split optional) |
| `category-cell.tsx` | 171 | ~60 (rebased on primitive) |
| `payee-cell.tsx` | 128 | ~60 (rebased on primitive) |
| new `category-combobox.tsx` / `payee-combobox.tsx` | — | ~180 / ~170 |
| new `rule-conflicts.ts` + test | — | ~200 + tests |

## Edge cases

- Rule editor with no payees at all: combobox shows only the create row.
- Payee created explicitly, then rule save fails validation: payee remains —
  acceptable (explicit action), user can delete on `/payees`.
- Conflicts on inactive rules: ignored (they don't fire).
- Conflict banner with many conflicts: show top 3 + "and N more".
- Opt-in off while an agent run is mid-flight: the SSE route guard prevents new
  runs; in-flight runs finish (tokens already spent) — acceptable.
- `detectRuleConflicts` performance: 500 rules → 125k pairs of cheap pure checks,
  `useMemo` on rule-list identity — fine.

## Testing plan

- `rule-conflicts.test.ts`: full kind matrix + containment/interval table.
- API tests (if route-test harness exists; otherwise scripted Neon checks per
  CLAUDE.md): rule create with unknown `payeeName` → 400; with `payeeId` → ok;
  payees POST duplicate → 409.
- Opt-in: unit-test the `runRulesAgentInBackground` early return (mock prefs);
  manual: toggle off → import CSV → no `rules-agent` job output; toggle on →
  suggestions appear.
- Manual QA: type-search category in editor (keyboard only); create payee
  explicitly from rule editor; shadow warning on `amazon` vs `amazon prime`.

## Rollout

Two PRs to keep review sane:

1. **PR-A (P0):** combobox primitives + editor integration + explicit-payee API
   contract + AI opt-in. No behavior change to existing rules.
2. **PR-B (P1):** `rule-conflicts` module + banners/badges + server `meta.conflicts`.

No migrations, no flags. Note in PR-A description that rule saves with
payee-name-only payloads from older clients will 400 — the only in-repo caller is
the editor being updated in the same PR.

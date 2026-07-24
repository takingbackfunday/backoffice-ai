# SDD-02 Implementation Handoff — Rules UX, Explicit Payee, AI Opt-in, Conflicts

Date: 2026-07-24 · Status: **~80% complete, uncommitted** · PRD: `prd-02-rules-ux-safety.md` · SDD: `sdd-02-rules-ux-safety.md`

## Where things stand

All work is in the working tree (not committed). `tsc --noEmit` is clean for
everything touched here (the only 2 errors are pre-existing test-file issues in
`src/lib/invoice-status.test.ts` and `src/lib/rules/evaluate-condition.test.ts` —
present on a clean tree, ignore them). `rule-conflicts.test.ts` passes (26 tests).
**`pnpm lint`, full `pnpm test`, and `pnpm build` have NOT been run yet.**

## Remaining work (in order)

1. **Rewrite `src/components/rules/rules-manager.tsx`** (currently 737 lines, untouched).
   This is the main remaining chunk. Spec:
   - New props: `aiSuggestionsEnabled?: boolean` (default false), `aiNudgeDismissed?: boolean`.
   - `const aiEnabled = aiSuggestionsEnabled ?? false`.
   - `showAgent` initial state: `autoAgent && aiEnabled` (was `autoAgent`).
   - Hide the "Run rules agent" button when `!aiEnabled`.
   - Replace the inline pending-suggestions banner (lines ~508-570) with
     `<RuleSuggestionsPanel>` (already written) — only render when `aiEnabled`.
     Panel props: `suggestions, categoryGroups, payees, projects, accounts, onAccepted,
     onIgnoreAll, onApplyComplete, onPayeeCreated, showToast`.
     `onAccepted(rule)` → prepend to rules + toast (panel handles dismissal/toast itself,
     parent's onAccepted just does `setRules(prev => [rule, ...prev])`).
     `onIgnoreAll()` → `setPendingSuggestions([])`.
   - Replace the inline payment-suggestions banner (lines ~572-640) with
     `<PaymentSuggestionsPanel>` (already written). Props:
     `suggestions, onReviewed={(id) => setPaymentSuggestions(prev => prev.filter(s => s.id !== id))}, showToast`.
     NOT gated on aiEnabled (invoice-payment suggestions are a different feature).
   - Replace the inline `RuleCard` + helpers (lines 12-158) with the extracted
     `RuleCard` from `./rule-card` (already written) and pass `conflicts={conflictsById.get(rule.id)}`.
   - Conflict wiring:
     ```ts
     import { detectRuleConflicts, groupConflictsByRule } from '@/lib/rules/rule-conflicts'
     import { userRuleToLike } from './rule-types' // re-exported via './rule-editor' too
     const conflicts = useMemo(() => detectRuleConflicts(rules.map(userRuleToLike)), [rules])
     const conflictsById = useMemo(() => groupConflictsByRule(conflicts), [conflicts])
     ```
   - Pass `allRules={rules}` and `onPayeeCreated={handlePayeeCreated}` to `<RuleEditor>`.
   - `handlePayeeCreated = (p: Payee) => setPayees(prev => [...prev.filter(x => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)))`
   - Nudge when `!aiEnabled && !nudgeDismissed` (place where the suggestions banner was):
     dashed-border box, copy "AI rule suggestions are off. Turn them on in Settings to get
     automatic rule ideas from your edits and imports.", a `next/link` to
     `/settings#ai-features`, and a ✕ dismiss button that does
     `fetch('/api/preferences', { method: 'POST', headers, body: JSON.stringify({ aiSuggestionsNudgeDismissed: true }) })`
     + `setNudgeDismissed(true)`. Local state init: `useState(aiNudgeDismissed ?? false)`.
   - Delete now-unused imports (`SuggestionCard`, moved helpers). Keep `RulesAgent` usage
     but pass `onPayeeCreated={handlePayeeCreated}`.
   - Target: ≤ 400 lines (extraction of the two panels + RuleCard makes this reachable).

2. **Update `src/app/rules/page.tsx`**:
   - Add `prisma.userPreference.findUnique({ where: { userId } })` to the `Promise.all`.
   - `const prefs = parsePreferences(prefRow?.data)` (import from `@/types/preferences`).
   - Pass `aiSuggestionsEnabled={!!prefs.aiRuleSuggestions}` and
     `aiNudgeDismissed={!!prefs.aiSuggestionsNudgeDismissed}` to `<RulesManager>`.

3. **Verify**: `pnpm lint && pnpm test && pnpm build`
   (build needs `DIRECT_URL` dummy per CLAUDE.md if unset).

4. **Manual QA** (per SDD testing plan): type-search category in editor (keyboard-only);
   create payee explicitly from rule editor; shadow warning on `amazon` vs `amazon prime`;
   toggle AI off → import CSV → no rules-agent run; save rule with unknown payee name → 400.

5. **Commit** (no push). Suggested message: `feat: rules UX safety — explicit payee creation, AI opt-in, conflict warnings (PRD-02)`.
   Also update `codebase_map.md` if it references rule-editor/rules-manager structure.

## What was done

### R2/R3 — Combobox primitives + editor integration
- **`src/components/ui/category-combobox.tsx`** (new): extracted from category-cell.
  Optional `context` prop fires the LLM suggest-category call (transactions cell passes it,
  rule editor omits it → no LLM call). `inputClassName`/`placeholder` props for styling.
  Owns its own outside-click close via `usePortalOutsideClick`.
- **`src/components/ui/payee-combobox.tsx`** (new): extracted from payee-cell. Owns the
  POST /api/payees create flow incl. 409 self-heal. `+ Create "X"` row only when no exact
  case-insensitive match. New props: `onPayeeCreated`, `onDraftChange`, `initialQuery`
  (seeds unmatched suggested names). Create flow calls BOTH `onPayeeCreated(p)` and
  `onCommit(p.id, p)` — callers must not commit twice (see transaction-row edit below).
- **`cells/category-cell.tsx` / `cells/payee-cell.tsx`**: rebased to thin wrappers
  (re-export `CategorySuggestion` / `PayeeDraftHandle` types for existing importers).
- **`rows/transaction-row.tsx`**: `onNewPayee` now ONLY upserts the payee list;
  commit happens via `onCommit={(v, freshPayee) => commitEdit(row.id, 'payeeId', v, freshPayee)}`.
  (`rows/new-row.tsx` needed no change — its split was already compatible.)

### R5 — Rule editor decomposition
- **`rule-types.ts`** (new): all shared types/constants (`UserRule`, `Payee`, `CategoryGroup`,
  `ConditionDef`, `OutputAction` (+ new optional `label` field), options, `defaultCondition`,
  `userRuleToLike()` mapper for the conflict detector).
- **`condition-row.tsx` / `output-row.tsx` / `live-preview.tsx`** (new): moved from
  rule-editor. OutputRow uses the two comboboxes (payee value is now a payee **id**;
  free-text category fallback kept only when `categoryGroups.length === 0`).
  LivePreview takes a new `payees` prop to resolve payee id → name.
- **`rule-editor.tsx`** (rewritten, ~330 lines): re-exports `* from './rule-types'`
  (so the ~12 existing importers keep working), keeps `Toast`, adds:
  - payee output as id + `label` (unmatched name) flow; `resolvePayee()` helper
  - live conflict banner via `allRules` prop + `RuleConflictBanner`
  - `onPayeeCreated` passthrough; new exported `RuleEditorFormData` type
  - **bugfix**: reads `editingRule.workspaceId ?? editingRule.projectId` and sends
    `workspaceId` (previously sent `projectId`, which zod stripped — project outputs
    were silently dropped on save)
  - save payload sends `payeeId` + `payeeName` (name kept for resolve-or-reject + naming)
  - catch displays `err.message` (SuggestionCard's handleSaveOverride now throws on 400)
- **`rule-conflict-banner.tsx`** (new): non-blocking amber banner, top-3 + "and N more".

### R1 — Conflict detection
- **`src/lib/rules/rule-conflicts.ts`** (new): pure `detectRuleConflicts` +
  `groupConflictsByRule`. Kinds: duplicate / conflict / shadowed / possible-overlap.
  Conservative: substring & interval containment for shadowing; provable-disjointness
  skips; possible-overlap only for *related* same-field pairs (noise control) or
  unprovable ops (regex/not_*/multi-def any). Inactive rules ignored.
- **`rule-conflicts.test.ts`**: 26 tests, all passing.
- **`src/lib/rules/rule-write.ts`** (new): `resolveRulePayee()` (id ownership check →
  case-insensitive name resolve → 400; returns canonical name) and
  `conflictsForSavedRule()` (server meta.conflicts, defense in depth).

### R3 — API explicit-payee contract
- `POST /api/rules`: accepts `payeeId`; resolve-or-reject via `resolveRulePayee`
  (upsert REMOVED); response now `201 { data, meta: { conflicts } }`.
- `PATCH /api/rules/[id]`: same; tri-state preserved (both keys absent → untouched;
  resolved → set; explicit nulls → clear). Returns `ok(rule, { conflicts })`.
- `POST /api/rules/suggestions/[id]` (accept): override payeeId/payeeName resolve-or-reject;
  no override → keep suggestion's own payee (already validated at creation).
- `POST /api/payees` already had case-insensitive 409 (no change needed).
- `rules-agent.tsx`: `saveRule` (auto-accept) sends `payeeId` + `payeeName`;
  `handleSaveOverride` throws with server error message; `suggestionToRule` sets
  `workspaceId`; `onPayeeCreated` threaded through RulesAgent + SuggestionCard.

### R4 — AI suggestions opt-in (default OFF)
- `preferences.ts`: `aiRuleSuggestions?: boolean` + `aiSuggestionsNudgeDismissed?: boolean`.
- `run-rules-agent.ts` `runRulesAgentInBackground`: early-return skip when off
  (single choke point — covers the import-enqueued job; import route unchanged per SDD).
- `suggest-from-edits/route.ts`: `ok({ count: 0, suggestions: [] })` when off.
- `api/agent/rules/route.ts` (SSE): refuses with an SSE error frame when off
  ("Enable them in Settings → AI features"); pref row reused for cooldown (deduped fetch).
- `use-inline-edit.ts`: new `aiSuggestionsEnabled` opt (default false) via `aiEnabledRef`;
  queued edits dropped silently in `fireSuggestions` when off.
- `transaction-table.tsx`: new `aiSuggestionsEnabled` prop → useInlineEdit.
- `app/transactions/page.tsx`: reads pref, passes prop.
- **`components/settings/ai-features-form.tsx`** (new): instant-save toggle,
  `id="ai-features"` anchor for the `/settings#ai-features` deep link.
- `app/settings/page.tsx`: renders `<AiFeaturesForm>` after PaymentSettingsForm.

## Key decisions & gotchas (don't rediscover these)

- **Agent-suggested payees can have `payeeId: null`** (rules-tools.ts:337 — "may be null
  if payee doesn't exist yet — that's OK"). So resolve-or-reject DOES affect the agent
  path: auto-accept of such a suggestion now 400s → saveRule returns null → falls back to
  a manual review card where the editor seeds the payee as an unmatched `label` draft —
  the user explicitly clicks "+ Create 'X'". This is the intended PRD flow, not a bug.
- **Editor always sends both `payeeId` and `payeeName`**: id set → verified; id null +
  name → resolve-or-reject (400 surfaces in the editor); both null → clears payee (PATCH).
- **`UserRule.projectId` was a lie** — runtime objects carry `workspaceId`. Type now
  declares both (`projectId` deprecated). Editor reads either; saves send `workspaceId`.
- **PayeeCombobox create flow calls `onPayeeCreated` AND `onCommit`** — parents must split
  list-upsert from commit (transaction-row updated accordingly; previously `onNewPayee`
  did both in one shot and `onCommit` was skipped).
- **`resolveRulePayee` returns canonical DB casing** for names — use it for rule naming.
- Possible-overlap deliberately does NOT fire for cross-field-only rule pairs or unrelated
  keywords (e.g. contains "rent" vs contains "spotify") — otherwise every pair of
  description rules would warn (30 rules → 400+ warnings).
- The SSE opt-out uses the route's existing pattern (status 200 + `type:'error'` SSE
  frame) because EventSource clients can't read HTTP error bodies.
- `POST /api/preferences` accepts arbitrary top-level keys (shallow merge, null deletes) —
  no migration needed for new prefs.
- Pre-existing tsc errors in `src/lib/invoice-status.test.ts` and
  `src/lib/rules/evaluate-condition.test.ts` — NOT from this work; leave them.
- CLAUDE.md reminders: never `git push` (triggers deploy); commit without pushing is fine;
  `pnpm build` needs `DIRECT_URL` set (dummy ok) for `prisma generate`.

## Resume prompt

"Resume SDD-02 from docs/sdd-02-handoff.md — remaining: rewrite rules-manager.tsx per the
handoff spec, wire rules/page.tsx prefs, run lint/test/build, then commit."

# SDD-01 — Transaction Row Editing & Filtering Fixes

Status: Draft · Date: 2026-07-24 · PRD: `prd-01-transaction-row-editing.md` · Effort: M (3–5 days)

## Root-cause analysis (all confirmed against source)

### Bug #1 — Category dropdown needs click on/off

`src/components/transactions/cells/category-cell.tsx`:

- `const [open, setOpen] = useState(true)` (line 36) — opens on mount.
- `setOpen(true)` exists in exactly one other place: `onFocus` (line 121).
- `commit()` (line 87) calls `setOpen(false)` **while the input retains focus** —
  guaranteed, because dropdown items use `onMouseDown={(e) => { e.preventDefault(); commit(...) }}`
  (lines 133, 143; `preventDefault` suppresses blur) and Enter commits via keydown.
- Re-clicking the already-focused input fires no `focus` event → dropdown stays
  closed until the user blurs and refocuses. Exactly the reported behavior.

Contributing: both `CategoryCell` and `PayeeCell` mount with `open=true`, so
entering row edit via any cell opens **both** portaled dropdowns at once.

### Bug #13 — Amount filter

`src/components/transactions/headers/column-filter-popover.tsx:36-39`:

```tsx
useOutsideClick(wrapRef, onClose, { enabled: isOpen })   // ← no ignoreSelector
```

`wrapRef` wraps only the funnel button; the popover panel is portaled to
`document.body` by `PortalDropdown`. Any `mousedown` inside the panel is an
"outside click" → `onClose()` fires before the click lands. Min works only because
it has `autoFocus` (line 99). Clear is gated on `{filterValue && ...}` (line 122)
— min only — though `isActive` correctly checks both. Identical defect at
`src/components/transactions/headers/date-filter-header.tsx:47`.

The data chain itself is fine: `use-transaction-data.ts:12-13,128-129` and
`src/app/api/transactions/route.ts:35-38,74-80` handle `amountMin`/`amountMax`
correctly. This is purely a UI bug.

### Bug #4 — New payee disappears on Done

`src/components/transactions/cells/payee-cell.tsx:81-87` — the outside-click
handler commits only an exact (case-insensitive) match or empty draft; a
non-matching draft is deliberately left uncommitted, then `exitRowEdit` unmounts
the cell and the display reverts to the old payee. The typed name is never created
and never shown again. Additionally:

- `createAndCommit` swallows failures: `if (!res.ok) { setCreating(false); return }`
  (line 48) — no error surfaced. Duplicate names hit `@@unique([userId, name])`
  → P2002 → generic 500 from `src/app/api/payees/route.ts:58-61`.
- The cell's `useOutsideClick` also lacks the `ignoreSelector` guard, so clicking
  inside its own portaled dropdown runs the outside-click handler first.

### Bug #7 — Description truncated

`src/components/transactions/rows/transaction-row.tsx:179-183` —
`max-w-[180px] truncate block`, and the parent `<td>` carries
`title="Click to edit"` (line 153), suppressing any useful tooltip. No detail view
exists anywhere (no `TransactionDetail` component, no route).

### Bug #3 — Make-rule loses payee

`src/components/transactions/hooks/use-inline-edit.ts`:

- Snap staged **after** `await fetch(PATCH)` resolves (lines 165-219). Clicking
  Done before resolution → `promoteIfLeft` (line 65) sees
  `pendingRuleSnapRef.current === null` and skips; the late snap is orphaned and
  cleared by the next `startEdit` (line 112).
- The suggest-from-edits queue merge `{ ...existing, ...editSnapshot }`
  (lines 205-207) lets a later snapshot with `payeeName: null` overwrite an
  earlier non-null value (unlike the pending snap's `??` merge at 210-219).
- `MakeRuleSnapType` (lines 10-15) has no `payeeId`.

The prefill plumbing itself is fine: `transaction-row.tsx:333-346` passes
`payee: { id: '', name }` when `payeeName` exists, and
`RuleEditor.initialOutputs` (rule-editor.tsx:510-521) adds a payee output when
`editingRule?.payee` is set. The bug is entirely in capture timing/merging.

## Design

### A. Shared hook: `usePortalOutsideClick`

New `src/hooks/use-portal-outside-click.ts`:

```ts
export function usePortalOutsideClick(
  ref: RefObject<HTMLElement>,
  handler: () => void,
  opts?: { enabled?: boolean },
) {
  return useOutsideClick(ref, handler, {
    ...opts,
    ignoreSelector: '[data-portal-dropdown]',
  })
}
```

Migrate: `payee-cell.tsx:81`, `column-filter-popover.tsx:39`,
`date-filter-header.tsx:47`. (`use-inline-edit.ts:97` already passes the guard —
switch it to the wrapper too for uniformity.) Leave `useOutsideClick` exported for
non-portal uses (e.g. modals with inline content).

### B. Category/payee combobox open-state (R1)

In both `category-cell.tsx` and `payee-cell.tsx`:

- Initialize `open` from the initial-field flag: `useState(autoFocus)` instead of
  `useState(true)` — only the clicked cell's dropdown auto-opens.
- Reopen on interaction: input `onMouseDown={() => setOpen(true)}` and
  `onChange={(e) => { setDraft(e.target.value); setOpen(true) }}` (payee-cell
  already reopens on change at line 94; category-cell needs both).
- Keep `commit()` closing the dropdown. After commit, a subsequent mousedown
  reopens — no blur/refocus cycle.

No API or parent changes; `autoFocus={isInitialField}` is already passed by
`transaction-row.tsx`.

### C. Amount/date filter popovers (R2)

- Switch both popovers to `usePortalOutsideClick` (fix A).
- Clear button gate: `{(filterValue || filterValue2) && (...)}` in
  `column-filter-popover.tsx:122`; Clear already calls both change handlers.
- Verify Tab order Min → Max works; keep `autoFocus` on Min.

### D. Payee creation prompt + error surfacing (R3)

New leaf component `src/components/transactions/cells/payee-create-prompt.tsx`
(rendered through `PortalDropdown`, anchored to the payee cell):

- `use-inline-edit.exitRowEdit` gains a guard: if the payee cell reports an
  unmatched non-empty draft (via a ref/callback registered from `PayeeCell`),
  don't exit — open the prompt: **Create payee "X"** (POST `/api/payees`, then
  `commitEdit(row.id, 'payeeId', id, payee)`) / **Discard** (exit edit, no commit).
- Implementation detail: `PayeeCell` exposes `getUnmatchedDraft()` through a ref
  prop (`unmatchedDraftRef`) supplied by the row; `transaction-row.tsx` owns the
  prompt's open state. This keeps `use-inline-edit.ts` small and the prompt a leaf.
- `PayeeCell.createAndCommit`: on `!res.ok`, read the error body and set local
  `error` state rendered under the input; keep the dropdown open.
- `POST /api/payees` (`src/app/api/payees/route.ts`): before `create`, run
  `findFirst({ where: { userId, name: { equals: name, mode: 'insensitive' } } })`;
  if found return `conflict()`-style 409 `{ error: 'Payee already exists', data: existing }`
  (add a `conflict()` helper to `src/lib/api-response.ts`). Client treats 409 with
  `data` as "select the existing payee" — self-heals case variants.

### E. Description visibility (R4)

New leaf `src/components/transactions/cells/description-cell.tsx`:

- View mode: `<span className="max-w-[clamp(180px,22vw,420px)] truncate block" title={value}>`.
- Move `title="Click to edit"` off the `<td>` in `transaction-row.tsx:153`; put
  `title="Click to edit"` only on non-text cells that lack their own tooltip.
- Extracting this cell also buys headroom in `transaction-row.tsx` (357 lines).

### F. Make-rule snap correctness (R5)

In `use-inline-edit.ts`:

1. `MakeRuleSnapType` gains `payeeId: string | null`.
2. **Stage synchronously:** compute and merge the snap immediately at commit
   dispatch (before `await fetch`), using the value being committed — not the
   response. The PATCH result only affects rollback, not the snap.
3. **Nullish merge everywhere:** the suggest-from-edits queue merge
   (lines 205-207) switches to the same `resolved ?? prev ?? null` pattern used at
   210-219. Extract both merges into one pure function:

```ts
// src/components/transactions/hooks/make-rule-snap.ts (new, pure, unit-tested)
export function mergeSnap(prev: MakeRuleSnapType | null, next: Partial<MakeRuleSnapType>): MakeRuleSnapType
```

4. `transaction-row.tsx:333-346` prefill: unchanged (already emits payee output
   when `payeeName` present). Confirm `payeeId` flows into `editingRule.payee.id`
   so the rule editor sends `payeeId` when the payee exists (aligns with SDD-02 R3
   server changes — the rules API will accept `payeeId`).

### G. Component-size budget

| File | Before | After (est.) | How |
|---|---|---|---|
| `transaction-row.tsx` | 357 | ~330 | extract `description-cell.tsx` |
| `transaction-table.tsx` | 375 | ~375 | no changes needed |
| `payee-cell.tsx` | 128 | ~160 | prompt wiring + error state |
| `use-inline-edit.ts` | 241 | ~235 | snap merge extracted to pure module |
| new: `payee-create-prompt.tsx` | — | ~80 | leaf |
| new: `make-rule-snap.ts` + `.test.ts` | — | ~60 + tests | pure |

All under the 400-line cap.

## Edge cases

- User commits a category then immediately hits Enter (row `onKeyDown` exits):
  dropdown already closed by commit; exit proceeds; snap was staged synchronously.
- Payee prompt open while user hits Escape: discard prompt only, keep row edit.
- Amount filter: `0` is falsy — treat "0" as a set value (`filterValue !== ''`),
  not via truthiness, when gating Clear. (Check current behavior; fix if broken.)
- 409 payee response: client selects the returned existing payee — never creates
  a duplicate, never dead-ends.
- Synchronous snap staging + failed PATCH: rollback removes the row change but the
  snap may reference an unapplied value. Acceptable: make-rule prefill is a
  suggestion the user confirms; do not attempt snap rollback (complexity).

## Testing plan

- New unit tests `make-rule-snap.test.ts`: merge semantics (payee preserved across
  category-only edits, nullish handling, category preserved across payee-only edits).
- `payees route` test (if route tests exist — check; otherwise manual): duplicate
  name → 409 with existing; case-insensitive match.
- Manual QA script (must pass before merge):
  1. Click category cell → commit → click again → dropdown reopens without blur.
  2. Enter edit via amount cell → only that cell focuses; no double dropdowns.
  3. Amount filter: set max only by mouse → results filter; Clear appears; clears.
  4. Date filter presets + custom inputs clickable.
  5. Type new payee → Done → prompt appears → Create → payee committed and in list.
  6. Type existing payee with different case → Create → 409 path selects existing.
  7. Hover truncated description → full text tooltip.
  8. Edit category + payee → Done (fast) → Make rule → rule prefilled with both
     category and payee outputs; condition is `description contains`.

## Rollout

Single PR, no migrations, no feature flags. Order within the PR: (A) hook +
migrations → (B, C) dropdown/filter fixes → (D) payee prompt + 409 → (E) tooltip →
(F) snap logic + tests. `pnpm lint && pnpm test && pnpm build` gate per CI.

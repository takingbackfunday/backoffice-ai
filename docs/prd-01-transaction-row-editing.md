# PRD-01 — Transaction Row Editing & Filtering Fixes

Status: Draft · Owner: Staff Eng · Date: 2026-07-24 · Priority: P0 · SDD: `sdd-01-transaction-row-editing.md`

## Problem

The `/transactions` page is the highest-traffic surface in the app, and its
single-transaction editing flow has five confirmed defects that make routine
categorization painful:

1. **Category dropdown won't reopen.** After committing a category, clicking the
   category cell again does nothing — the user must click away and back ("click on
   and off") to reopen the dropdown. (Root cause confirmed: the dropdown's `open`
   state is only set by mount and `onFocus`; commit closes it while the input keeps
   focus, so no new focus event ever fires.)
2. **Amount filter is broken.** The Max input can't be clicked at all (the filter
   popover closes on any internal click), and the Clear button only appears when a
   Min value exists — so a filter can't be cleared without a page refresh.
3. **New payees vanish.** Typing a new payee name and clicking Done silently
   discards it; a failed payee create (e.g. duplicate name) fails silently too.
4. **Descriptions are unreadable.** Descriptions are hard-truncated at 180px and
   the native tooltip is suppressed by `title="Click to edit"` — there is no way to
   see a full bank description anywhere.
5. **Make-rule loses the payee.** When a user edits both category and payee on a
   transaction and clicks "Make rule", the rule often picks up only the category
   (snap is staged only after the PATCH resolves — a race — and a later merge can
   overwrite `payeeName` with `null`).

## Goals

- Every editable cell on the transactions table behaves predictably on first click.
- Amount range filtering works for min, max, and both, and is clearable in place.
- Payee creation is explicit, reliable, and surfaces errors.
- Users can read a full transaction description without entering edit mode.
- "Make rule" faithfully captures everything the user just changed.

## Non-goals

- A dedicated transaction detail page/route or side drawer (considered — see
  Alternatives; deferred).
- Bulk editing, NL search, or any change to the import pipeline (see PRD-03).
- Redesign of the table layout or columns.

## User stories

- As a user categorizing transactions, when I click a committed category cell the
  dropdown reopens immediately so I can change my mind without clicking away first.
- As a user, I can filter transactions by max amount only, min only, or a range,
  and clear the filter from the popover.
- As a user, when I type a new payee and click Done, I'm told the payee wasn't
  saved and offered a one-click "Create payee" — it never disappears silently.
- As a user, I can hover (or expand) a truncated description to read it in full.
- As a user, when I make a rule from an edited transaction, the rule sets both the
  category and the payee I assigned.

## Requirements

### R1 — Category/payee dropdown open-state fix (P0, bug #1)

- The category combobox must open on input click/mousedown, not only on focus, and
  reopen after a commit without requiring a blur/refocus cycle.
- When a row enters edit mode, only the initially-clicked cell's dropdown may
  auto-open (today both category and payee dropdowns open simultaneously).

### R2 — Amount filter fix (P0, bug #13)

- Min and Max inputs must both be focusable and editable by mouse and keyboard.
- The Clear button must appear whenever *either* bound is set and must reset both.
- The same `useOutsideClick` defect must be fixed in the date filter popover
  (identical root cause, less visible).

### R3 — Payee creation reliability (P0, bug #4)

- A typed payee name that doesn't match an existing payee must never be silently
  discarded on exit: on Done/click-away with an unmatched draft, show an inline
  "Create payee 'X'?" prompt (Create / Discard). This keeps creation an explicit
  action (consistent with PRD-02 R3) while eliminating silent data loss.
- `POST /api/payees` failures (duplicate name, network) must surface an inline
  error, not fail silently. Duplicate names must return a friendly 409 and attempt
  a case-insensitive match first (prevents `Amazon`/`amazon` duplicates).

### R4 — Full description visibility (P1, bug #7)

- The description cell shows the full text on hover via a proper tooltip (replace
  the blanket `title="Click to edit"` on the `<td>` with per-cell titles).
- The description column widens when the viewport allows (responsive max-width
  instead of fixed 180px).

### R5 — Make-rule captures payee (P0, bug #3)

- The make-rule snap must capture `payeeId` + `payeeName` synchronously at commit
  time (before the PATCH resolves), so clicking Done quickly can't orphan it.
- Merging multiple edits for the same row must be nullish-aware: a later edit that
  doesn't touch the payee must not erase an earlier payee capture.
- The prefilled rule keeps `description contains` as the condition (per the rules
  agent's own guidance — payee-based conditions never match fresh imports) and adds
  the payee as a rule **output** whenever the user assigned one.

### R6 — Architectural hardening (P1)

- Introduce a `usePortalOutsideClick` hook (wraps `useOutsideClick` with
  `ignoreSelector: '[data-portal-dropdown]'` baked in) and migrate the three
  offending call sites (`payee-cell.tsx`, `column-filter-popover.tsx`,
  `date-filter-header.tsx`).
- Respect the 400-line component cap: `transaction-row.tsx` (357) and
  `transaction-table.tsx` (375) have almost no headroom — new UI (payee prompt,
  tooltip cell) lands in extracted leaf components.

## Success metrics

- Zero reproducible reports of "dropdown doesn't open" / "filter can't be cleared".
- Make-rule prefills include a payee output whenever the triggering edit set one
  (verify via unit tests on extracted snap logic).
- No component in `src/components/transactions/` exceeds 400 lines after the work.

## Alternatives considered

- **Transaction detail drawer/page.** A right-side drawer on row click would give
  descriptions room and a natural home for editing + make-rule. Rejected for this
  cycle: it replaces the established inline-edit muscle memory, is a much larger
  change, and every reported bug here is fixable in the current architecture for a
  fraction of the cost. Revisit if detail-view requests keep accumulating.
- **Auto-create payees on Done.** Rejected: silently creating entities contradicts
  the explicit-creation principle the user asked for on the rules page (PRD-02 R3).
  The Create/Discard prompt is the consistent middle ground.
- **Single-cell edit mode** (only the clicked cell becomes editable). Rejected for
  now: row-level edit with a Done button is an established pattern here; the
  double-dropdown symptom is fixed by R1's initial-field gating instead.

## Open questions

- Should the payee Create/Discard prompt also offer "Apply to similar
  transactions" (i.e. straight into make-rule)? Lean: no — keep the prompt binary.

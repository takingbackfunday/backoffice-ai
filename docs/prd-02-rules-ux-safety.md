# PRD-02 — Rules UX, Explicit Payee Creation, AI Opt-in & Conflict Warnings

Status: Draft · Owner: Staff Eng · Date: 2026-07-24 · Priority: P0/P1 · SDD: `sdd-02-rules-ux-safety.md`

## Problem

The `/rules` page is where users encode their categorization intent, but four
gaps undermine trust and usability:

1. **No contradiction detection.** Rules are first-match-wins by priority. Nothing
   warns when a new rule duplicates, conflicts with, or is permanently shadowed by
   an existing rule — users create rules that never fire or fight each other.
2. **Category picking is painful.** The rule editor uses a plain grouped
   `<select>` with no search, while the transactions page has a type-ahead
   combobox. With dozens of categories across groups, picking one is slow.
3. **Payees are created accidentally.** The rule editor's payee field is free text
   with a `<datalist>`; saving a rule silently upserts any typed string into the
   Payee table (case-sensitively — `Amazon` vs `amazon` creates duplicates).
   Misspellings become permanent payee records.
4. **AI suggestions are forced on everyone.** The rules agent runs automatically
   after every import and after manual edits, writing `RuleSuggestion` rows and
   burning LLM tokens, with no way to turn it off.

## Goals

- Users are warned — at creation time and in the list — when rules contradict,
  duplicate, or shadow each other.
- Category and payee picking in the rule editor match the transactions page UX.
- A Payee row is only ever created by an explicit user action.
- AI rule suggestions are off by default; enabling them is a deliberate opt-in.

## Non-goals

- Changing the rules engine semantics (first-match-wins, priority 1–99) or the
  condition DSL.
- Changing the rules agent's prompt, models, or suggestion-quality heuristics.
- Auto-resolving or auto-reordering conflicting rules (we warn; the user decides).
- Formal satisfiability checking of condition logic (we use conservative
  heuristics — see SDD).

## User stories

- As a user creating a rule, when my new rule overlaps an existing one with a
  different outcome, I see a warning naming the conflicting rule before I save.
- As a user, when a rule can never fire because a higher-priority rule catches the
  same transactions, I see that flagged in the rules list.
- As a user, I can type "uti" to find "Rent & Utilities" in the rule editor
  instead of scrolling a long select.
- As a user, a new payee is only created when I explicitly click "Create payee" —
  never as a side effect of saving a rule.
- As a user, AI rule suggestions never run unless I turn them on in Settings;
  when off, I see no suggestion banners, no background runs, and no token spend.

## Requirements

### R1 — Contradictory-rule warnings (P1, item #2)

- A pure, unit-tested detection module flags these relationships among a user's
  active rules (lower priority number = runs first):
  - **Duplicate** — identical normalized conditions with identical outputs
    (informational: redundant).
  - **Conflict** — identical or overlapping conditions with *different* outputs
    (e.g. same `description contains "amazon"`, different categories).
  - **Shadowed** — rule B can never fire because an earlier rule A matches every
    transaction B would match (e.g. A: `contains "amazon"`, B: `contains "amazon prime"`).
- Warnings surface in two places:
  - **Save time:** the rule editor shows a non-blocking warning banner naming the
    conflicting rule(s) and the relationship; user can save anyway or cancel.
  - **List time:** affected rules get a warning badge in the rules list with a
    tooltip/popover explaining the relationship.
- Detection is conservative: it may produce false positives on `regex`,
  `not_*`, and multi-condition `any` groups — label those as "possible overlap",
  never block saving.

### R2 — Searchable category picker in rule editor (P1, item #5)

- Replace the native `<select>` with a type-ahead combobox filtering across
  category and group names, keyboard navigable, rendered via `PortalDropdown`
  (the editor scrolls).
- Share the implementation with the transactions page cell via an extracted
  `CategoryCombobox` primitive (the transactions cell adds LLM confidence scoring
  on top; the rule editor uses the plain variant).

### R3 — Explicit payee creation in rule editor (P0, item #6)

- The payee output field becomes a combobox of existing payees with a distinct
  "+ Create payee 'X'" row shown only when there's no exact match — mirroring
  `PayeeCell` on the transactions page.
- Selecting an existing payee sends `payeeId`; creating a new one goes through
  `POST /api/payees` first, then the created id is used.
- The rules API stops implicitly upserting payees: `POST/PATCH /api/rules`
  accept `payeeId` and **reject unknown `payeeName` strings** (400) unless the
  payee was created explicitly beforehand. (The `payeeName` field is retained
  temporarily for the rules-agent suggestion path, which already validates against
  existing payees — see SDD for the migration detail.)
- Case-insensitive duplicate protection in `POST /api/payees` (shared with SDD-01).

### R4 — AI suggestions opt-in, default off (P0, item #9)

- New preference `aiRuleSuggestions?: boolean` — absent/false = off, for new **and
  existing** users.
- When off:
  - The post-import background rules-agent run is skipped (no LLM tokens spent).
  - The post-edit `suggest-from-edits` mini-agent is skipped.
  - The rules page hides the suggestions banner and disables/hides the "Run rules
    agent" button; `?agent=1` does not auto-open the panel.
  - The SSE route `GET /api/agent/rules` refuses to run (403-style error).
- A toggle in `/settings` (new "AI features" section) controls it, with a one-line
  explanation. Optionally, the rules page shows a dismissible empty-state nudge
  ("Turn on AI rule suggestions in Settings") when off — never the suggestions
  themselves.
- Existing `PENDING` suggestions are preserved but hidden while opted out;
  they reappear if the user opts back in.

### R5 — Rule editor decomposition (P1, enabler)

- `rule-editor.tsx` (720 lines) and `rules-manager.tsx` (737) already violate the
  400-line cap. R1–R3 must not add net lines to them: extract `ConditionRow`,
  `OutputRow`, `LivePreview`, and the new comboboxes into sibling files.

## Success metrics

- Rule editor category/payee selection is keyboard-first with ≤2 interactions to
  find any category.
- Zero implicit `Payee` rows created (verify: saving a rule with a non-existent
  payee name returns 400).
- With the preference off, an import enqueues no `rules-agent` job and
  `suggest-from-edits` performs no LLM call (assert via logs/tests).
- Conflict warnings render on a fixture rule set covering duplicate/conflict/
  shadowed/overlap cases (unit tests).

## Alternatives considered

- **Server-side-only conflict detection** (warnings computed in the rules API).
  Rejected as the sole mechanism: the rules list is already fully loaded client
  side, and a pure module can run there with zero API changes. Server still
  re-checks at save time for defense in depth.
- **Data-driven conflict detection** (compare matched-transaction sets per rule
  via the existing preview machinery). More accurate but O(rules × transactions)
  and needs a server round-trip per check. Deferred to a follow-up; the heuristic
  module catches the common cases cheaply.
- **Opt-in via account-level env/config.** Rejected: this is a per-user product
  preference; `UserPreference.data` is the established mechanism (dashboard
  currency, invoice notes, etc.).
- **Deleting PENDING suggestions on opt-out.** Rejected: destructive and
  surprising; hiding is reversible.

## Open questions

- Should opting out also stop the *omni* agent from suggesting rules in chat?
  Lean: out of scope here — omni is user-invoked, so it isn't "passive" AI.

## Decisions (confirmed 2026-07-24)

- **Off by default for everyone, including existing users** who have previously
  used AI suggestions — no grandfathering. The settings toggle re-enables it;
  existing PENDING suggestions are preserved and reappear on opt-in.

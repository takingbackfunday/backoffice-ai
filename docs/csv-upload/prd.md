# PRD — Statement Import (CSV / Excel / PDF) UX Improvements

| | |
|---|---|
| Status | Ready for implementation |
| Route | `/upload` ("Import transactions") |
| Companion doc | [`sdd.md`](./sdd.md) — the technical design and step-by-step task list |
| Last updated | 2026-10-08 |

---

## 1. Background

Users import bank transactions by dropping a CSV, Excel or PDF statement on `/upload`. They then
pick an account, map columns (date / amount / description / notes), check a live preview and
click Import. The parsing engine underneath handles messy files well: preamble detection,
row repair, date-format detection and statement-total reconciliation.

A UX review found three kinds of problems:

1. **A functional gap.** Many banks export **separate Debit and Credit columns** (also called
   "Paid out / Paid in", "Withdrawals / Deposits" or "Soll / Haben") instead of one signed
   Amount column. CSV and Excel imports support **only one amount column**. When a user picks
   "Debit", every credit row (salary, refunds, incoming transfers) fails with "amount column is
   empty". Those rows end up as an amber "could not be parsed" count, and **Import still goes
   ahead with only half the transactions.** (PDF imports are not affected; the LLM merges the
   columns itself.)
2. **Bugs that show up as UX problems** in the completion dialog, the dropzone and the Cancel
   button.
3. **Friction.** The account must be picked before any preview, the column dropdowns show
   header names without sample values, the file list appears twice, the main action can scroll
   out of view, and the flow is hard to leave or repeat at the end.

## 2. Goals

- G1. Users can import files with separate debit and credit columns, with no manual
  spreadsheet editing.
- G2. Users never import a partial file without being told (rows that couldn't be read, or
  totals that don't match the statement).
- G3. The completion dialog shows accurate information about *this* import only.
- G4. Fewer clicks and less guesswork between dropping a file and seeing a trustworthy
  preview.

## 3. Non-goals (this release)

- Editing or excluding individual rows in the preview.
- Filter tabs in the preview (New / Duplicates / Errors).
- A third amount format: one Amount column plus a "D"/"C" indicator column.
- LLM detection of debit/credit layouts (deterministic header detection only).
- Cancelling an in-flight PDF extraction.
- Responsive / mobile layout of the mapper.
- A "view just this import" filter on `/transactions`.

These are tracked in §9 (Follow-ups).

## 4. Users and key scenarios

| # | Scenario | Today | After |
|---|---|---|---|
| S1 | UK user drops a Barclays/HSBC CSV with `Paid out` / `Paid in` columns | Half the rows are skipped; the user may import half the data | Split layout auto-detected; all rows import with correct signs |
| S2 | User's file has 3 unreadable rows | Import goes ahead silently; the success message doesn't mention them | Confirmation step: "3 rows couldn't be read and won't be imported" |
| S3 | User imports a file where every row is a duplicate | Dialog shows the *previous* import's background tasks, or "Loading task status…" forever | Dialog says "Nothing new to import" and shows no task section |
| S4 | User has one bank account | Must pick it from a dropdown before seeing any preview | Picked automatically; preview appears straight away |
| S5 | User clicks Cancel by mistake | Files and mapping are lost instantly | Asked to confirm first |
| S6 | User has 3 accounts to import in one sitting | After each import, OK sends them to `/transactions`; they navigate back | "Import another file" keeps them on `/upload` |

## 5. Requirements

Priority: **P0** = must ship, **P1** = should ship in this release, **P2** = nice to have.

### 5.1 Separate debit/credit columns (P0)

- **R1.1** The mapper has an **Amount format** control with two options:
  "One amount column" (default) and "Separate money out / money in columns".
- **R1.2** In split mode the single "Amount column" and "Amount sign" controls are replaced by
  two required dropdowns: **"Money out (debit) column"** and **"Money in (credit) column"**.
  The two must be different columns.
- **R1.3** Conversion rules, per row:
  - Money out value *x* → transaction amount **−|x|**
  - Money in value *y* → transaction amount **+|y|**
  - Empty and `0` / `0.00` count as "no value".
  - Exactly one side has a value → import it.
  - One side is zero and the other is empty → amount 0 (this matches single-column
    behaviour for `0.00`).
  - **Both sides empty** → row fails: `Row N: both "<debit>" and "<credit>" are empty`.
  - **Both sides have non-zero values** → row fails, never guessed:
    `Row N: both "<debit>" (x) and "<credit>" (y) have values — expected only one`.
  - A value that isn't a number → row fails, same wording as today's invalid-amount message,
    naming the column.
  - All existing number formats keep working: European decimals, parentheses, currency
    symbols, trailing minus.
- **R1.4** **Auto-detection.** If the headers contain a debit-like column *and* a credit-like
  column, and **no** column named exactly "Amount", the mapper opens in split mode with both
  columns pre-selected. Header vocabulary is listed in the SDD (covers EN and DE).
- **R1.5** Saved import profiles remember the amount format. The next upload with the same
  headers restores split mode automatically.
- **R1.6** Duplicate detection must not change: the same transaction gives the same duplicate
  hash whether it came from a split file or a single-column file.
- **R1.7** Statement-total reconciliation works in split mode.
- **R1.8** Messy-row repair (unquoted commas in descriptions) works in split mode.
- **R1.9** Existing saved profiles and institution mappings (single column) keep working
  unchanged. No database migration.

### 5.2 Never import partially without telling the user (P0)

- **R2.1** If the preview has any rows that couldn't be read **or** the totals don't match the
  statement, clicking Import opens a **confirmation dialog** first. It contains:
  - "N rows couldn't be read and won't be imported", showing the first 5 errors
  - and/or "Parsed totals differ from the statement summary (expected X, got Y)"
  - Buttons: **"Go back and fix"** (closes the dialog) and **"Import N transactions anyway"**.
- **R2.2** If nothing is wrong, Import works as today (no dialog).
- **R2.3** The completion dialog mentions unread rows:
  "Imported 120 transactions · 4 skipped as duplicates · 3 rows couldn't be read."

### 5.3 Bug fixes (P0)

- **R3.1** The completion dialog shows only the background tasks created by **this** import.
  If none were created (nothing new imported), the tasks section is hidden entirely.
- **R3.2** Polling for task status stops when all tasks finish, or after 2 minutes at most. In
  the latter case, show "Still running in the background — you can close this."
- **R3.3** Dropping or choosing files while a file is still being processed shows an inline
  message ("Still reading the previous file — try again in a moment") instead of silently
  ignoring the drop.
- **R3.4** "Cancel" is renamed **"Start over"**, styled as a low-emphasis text button, and asks
  for confirmation ("Discard this import? Your files and column choices will be cleared.")
  before resetting.

### 5.4 Faster path to a trustworthy preview (P1)

- **R4.1** If the user has exactly **one** account, it is selected automatically.
- **R4.2** If a saved profile pre-selects the account, show a one-line note under the account
  dropdown: "Pre-selected from your last import of this file format."
- **R4.3** Every option in a column dropdown shows a sample value from the first file, e.g.
  `Value Date — e.g. 03/04/2026`. Long samples are truncated to 24 characters with "…".
  Existing confidence suffixes stay, e.g. `Date — 95% · e.g. 03/04/2026`.

### 5.5 Layout clean-up (P1)

- **R5.1** The multi-file list appears **once**, in the left rail. Remove the duplicate chip
  row above the mapper.
- **R5.2** On the mapping step, the "add more files" dropzone moves from the top of the page
  into the left rail, under the file list, as a compact "+ Add files with the same columns"
  area. Its errors and sheet pickers show there too.
- **R5.3** The **Import** button (with the "Start over" link under it) is pinned to the bottom
  of the left rail, so it stays visible however long the rail gets.
- **R5.4** A reconciliation mismatch shows as a full-width amber banner above the preview
  table, not as inline text in the stats row. A match stays as the small green ✓ inline text.
- **R5.5** The progress indicator capitalises its labels ("Upload", "Map & import") and shows
  a ✓ on completed steps.

### 5.6 End of the flow (P1)

- **R6.1** The completion dialog has two buttons: **"Import another file"** (secondary: resets
  and stays on `/upload`) and **"Go to transactions"** (primary: today's OK behaviour).
- **R6.2** Both buttons mark onboarding as done when the user is in onboarding (today only OK
  does).

### 5.7 Naming (P2)

- **R7.1** Use "Import transactions" consistently: page `<title>`, sidebar label, and the
  "↑ Upload CSV" button in the transactions bulk-delete bar. The page already accepts
  Excel and PDF.

### 5.8 AI mapping changes are visible and undoable (P1)

Context: after a file is dropped, an LLM checks the column mapping. Today, any column it rates
≥99% confident overwrites the user's (untouched) choice **silently**, and this can happen up to
30 seconds after the screen first loads. That breaks the CLAUDE.md rule that AI writes must be
highlighted and confirmable. Decision: **keep the auto-apply, but make it visible and
reversible.**

- **R8.1** When the AI changes one or more columns, each changed dropdown gets the existing
  `ai-changed` highlight (the same pulsing style used in the invoice/quote editors).
- **R8.2** A banner appears at the top of the "Map columns" section, listing every change:
  "AI changed **Amount**: `Betrag` → `Umsatz`". It has two buttons: **Undo** and **Keep**.
  - **Undo** restores the previous value of every changed field and clears the highlight.
  - **Keep** clears the highlight and banner and keeps the AI's values.
- **R8.3** If the user edits a highlighted dropdown, that field counts as confirmed: its
  highlight goes away and it drops off the banner. The banner hides when no changes are left.
- **R8.4** Clicking **Import** while changes are pending counts as **Keep**. It doesn't block
  the import, because the preview already reflects the AI's values.
- **R8.5** Nothing else changes: suggestions below 99% confidence still only show as
  percentages in the dropdown, fields the user already touched are never overwritten, saved
  profiles skip the AI check, and the amount sign is never auto-applied.
- **R8.6** If the AI agrees with the current mapping (no value would change), no banner shows.

## 6. UX copy (final)

| Location | Copy |
|---|---|
| Amount format label | Amount format |
| Option 1 | One amount column |
| Option 2 | Separate money out / money in columns |
| Split dropdown 1 | Money out (debit) column * |
| Split dropdown 2 | Money in (credit) column * |
| Same column chosen twice | Money out and money in must be different columns. |
| Split auto-detected hint | Detected separate money out / money in columns. |
| Busy drop | Still reading the previous file — try again in a moment. |
| Start over confirm title | Discard this import? |
| Start over confirm body | Your files and column choices will be cleared. |
| Start over confirm buttons | Keep editing / Discard |
| Pre-import confirm title | Some rows won't be imported |
| Pre-import confirm buttons | Go back and fix / Import N transactions anyway |
| Account pre-selected note | Pre-selected from your last import of this file format. |
| Done dialog buttons | Import another file / Go to transactions |
| Tasks timeout | Still running in the background — you can close this. |
| AI change banner title | AI updated your column mapping |
| AI change line | AI changed **<Field>**: `<old or "none">` → `<new>` |
| AI change buttons | Undo / Keep |

## 7. Success metrics

- Share of imports with `skippedCount > 0` at import time — expected to fall.
  (Count `ImportBatch` rows against the preview's unread count, or log it at import.)
- No new duplicate transactions caused by the change: on a test account, re-importing the same
  file after switching between single and split mode gives **0 new** rows.
- Qualitative: a split-column file from a UK bank (Barclays / HSBC / Monzo-style export)
  imports with no manual mapping changes.

## 8. Release plan

Ship as **four PRs**, in order (details in the SDD):

1. **PR 0 — Refactor (no behaviour change).** Split `column-mapper.tsx` (at the 400-line cap)
   into hooks and sub-components so later PRs have room.
2. **PR 1 — Debit/credit columns** (§5.1).
3. **PR 2 — Safety and bug fixes** (§5.2, §5.3).
4. **PR 3 — UX polish** (§5.4–5.8).

Each PR must pass `pnpm lint && pnpm test && pnpm build` and the manual QA list for its
section (SDD §8).

## 9. Follow-ups (out of scope, for later)

- Preview filter tabs and per-row exclude checkboxes.
- Amount + D/C indicator column format.
- Teach `/api/llm/validate-mapping` about split layouts.
- `/transactions?importBatchId=` filter so the done dialog can link to "View imported".
- Cancel and progress for PDF extraction.
- Stacked layout for narrow screens.
- Locale-based default currency in the inline new-account form (currently hard-coded
  `US`/`USD`).

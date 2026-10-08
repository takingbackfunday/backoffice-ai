# SDD — Statement Import UX Improvements

| | |
|---|---|
| Status | Ready for implementation |
| Requirements | [`prd.md`](./prd.md) — requirement IDs (R1.1 …) are referenced throughout |
| Audience | An engineer new to this codebase. Read §1–§3 before writing any code. |

---

## 1. Read this first

### 1.1 Rules that apply to every PR

These come from `CLAUDE.md`. Reviewers will reject PRs that break them.

1. **Component files must stay ≤ 400 lines.** `column-mapper.tsx` is at exactly 400 now, so
   PR 0 exists to make room. Put logic in `use*` hooks (folder:
   `src/components/upload/hooks/`) and leaf JSX in sibling files.
2. **Amounts are parsed only with `parseAmount`** (`src/lib/amount.ts`). Never use
   `parseFloat` / `Number()` on cell values; they corrupt European decimals.
3. **No arithmetic on parsed float amounts.** The split-column design below never adds or
   subtracts two amounts; it picks one and sets its sign. Keep it that way.
4. **Use `analyzeCsv` for headers and rows in UI code.** Never re-parse a CSV with papaparse
   in components.
5. **Tests are pure-logic Vitest only** (no React Testing Library). Put new tests next to the
   module (`foo.ts` → `foo.test.ts`). UI behaviour is verified with the manual QA lists (§8).
6. **Commit, don't push.** Pushing `main` deploys to production.
7. Before each PR: `pnpm lint && pnpm test && pnpm build`. If `build` complains about
   `DIRECT_URL`, run `DIRECT_URL="postgresql://x:x@localhost/x" pnpm build`.

### 1.2 `CsvMapping` is declared twice

There are two identical `CsvMapping` interfaces:

- `src/lib/csv-processor.ts:8` — used by the parser and the API routes
- `src/types/index.ts:12` — used by older code (institutions)

**PR 1 changes both identically.** (Optionally, make `types/index.ts` re-export the type from
`csv-processor.ts` to remove the duplication. Do this only if `pnpm build` stays green.)

## 2. How the flow works today

```
/upload  (src/app/upload/page.tsx → server: loads accounts)
  └─ UploadPageClient            src/components/upload/upload-page-client.tsx
       ├─ progress nav (2 steps)
       ├─ CsvDropzone            src/components/upload/csv-dropzone.tsx
       │    reads CSV / Excel (client-side) / PDF (POST /api/upload/pdf)
       │    → useUploadStore.addFiles()  → step = 'map-columns'
       │    → first file: GET /api/import-profiles?signature=…  (saved mapping)
       ├─ ColumnMapper           src/components/upload/column-mapper.tsx
       │    ├─ AccountRail (+ NewAccountForm)
       │    ├─ ColSelect × 4, amount sign, date-ambiguity prompt
       │    ├─ useMappingValidation → POST /api/llm/validate-mapping (AI check)
       │    ├─ debounced POST /api/upload            → preview rows + meta
       │    │      (processCSV → dedup → rules categorisation)
       │    ├─ PreviewTable
       │    └─ Import → POST /api/transactions/import  → step = 'done'
       └─ Dialog (step === 'done') → polls GET /api/jobs/recent
```

State lives in a Zustand store: `src/stores/upload-store.ts`. Shared types are in
`src/types/index.ts` (`UploadFile`, `PreviewRow`, `UploadState`).

Parsing core:
- `src/lib/csv-structure.ts` — `analyzeCsv` (delimiter, header row, preamble), `repairRow`,
  `findStatementTotals`
- `src/lib/csv-processor.ts` — `processCSV(csvText, mapping, accountId)` → rows / errors /
  reconciliation
- `src/lib/amount.ts` — `parseAmount(raw, inverted)`
- `src/lib/guess-mapping.ts` — header-name heuristics (`guessMapping`, `scoreCandidates`)
- `src/lib/dedup.ts` — `buildDuplicateHash({ accountId, date, amount, description, occurrence })`

## 3. PR overview

| PR | Title | Requirements | Risk |
|---|---|---|---|
| 0 | Refactor column-mapper (no behaviour change) | — | Low |
| 1 | Separate debit/credit columns | R1.1–R1.9 | **Medium — touches the parser** |
| 2 | Import safety and bug fixes | R2.1–R2.3, R3.1–R3.4 | Low |
| 3 | UX polish + AI change highlight/undo | R4.1–R8.6 | Low |

Do them in order. Each PR is independently shippable.

---

## 4. PR 0 — Refactor `column-mapper.tsx`

**Goal:** move code out of the file without changing behaviour, so later PRs have line budget.

### 4.1 Extractions

| New file | Moves from `column-mapper.tsx` | Exports |
|---|---|---|
| `hooks/use-import-preview.ts` | preview state (`previewRows`, `totalRows`, `skippedCount`, `duplicateCount`, `perFile`, `parseErrors`, `reconciliations`, `previewLoading`, `previewError`), `debounceRef`, and the debounced `/api/upload` effect (current lines ~37–45, ~130–171) | `useImportPreview({ mapping, isValid, accountId, files })` → all of the above as an object |
| `hooks/use-import-submit.ts` | `importing`, `importError`, `handleImport` (lines ~51–52, ~173–223) | `useImportSubmit({ accountId, files, previewRows, csvHeaders, mapping, source })` → `{ importing, importError, submit }` |
| `amount-fields.tsx` | Amount column `ColSelect`, amount-sign `<select>`, sign-suggestion box (lines ~292–324), plus the `showSignSuggestion` computation and `signSuggestionDismissed` state | `<AmountFields mapping setMapping touchedRef validation candidates headers />` |
| `preview-summary.tsx` | Stats row, per-file strip, parse-error box (lines ~351–394) | `<PreviewSummary … />` |

Rules for the move:
- Copy code verbatim first, then fix imports. No renames, no "while I'm here" changes.
- `useImportSubmit` calls `useUploadStore` itself for `setLastImport` / `setStep`.
- `touchedRef` stays owned by `ColumnMapper`; pass it down.

### 4.2 Done when

- `column-mapper.tsx` ≤ ~260 lines; every new file ≤ 400.
- `pnpm lint && pnpm test && pnpm build` pass.
- Manual smoke: run QA steps Q0.1–Q0.3 (§8). Behaviour is identical.

---

## 5. PR 1 — Separate debit/credit columns

### 5.1 Data model (no DB migration)

`CsvMapping` gets three optional fields. **Absent `amountMode` means `'single'`**, so every
existing saved profile (`ImportProfile.mapping`, JSON) and institution mapping keeps working.

```ts
// src/lib/csv-processor.ts  (mirror in src/types/index.ts)
export type AmountMode = 'single' | 'split'

export interface CsvMapping {
  dateCol: string
  descCol: string
  /** Absent = 'single' (all pre-existing profiles). */
  amountMode?: AmountMode
  /** Required when amountMode is 'single' / absent. */
  amountCol?: string
  /** Required when amountMode is 'split' — money out. */
  debitCol?: string
  /** Required when amountMode is 'split' — money in. */
  creditCol?: string
  dateFormat?: string
  /** Only meaningful in single mode. Ignored in split mode. Still required by zod for compatibility. */
  amountSign: 'normal' | 'inverted'
  notesCol?: string
}
```

Making `amountCol` optional causes type errors where it's used. Fix each one; the list is
in §5.9. `ImportProfile.mapping` is saved via `z.record(z.string())` in
`/api/transactions/import`. All new fields are strings, so **that route needs no change**.

Add two helpers to `csv-processor.ts` and **use them everywhere** instead of checking fields
by hand:

```ts
export function isSplitMapping(m: Partial<CsvMapping>): boolean {
  return m.amountMode === 'split'
}

/** True when every column required for the current amount mode is chosen. */
export function isMappingComplete(m: Partial<CsvMapping>): boolean {
  if (!m.dateCol || !m.descCol) return false
  if (isSplitMapping(m)) return !!m.debitCol && !!m.creditCol && m.debitCol !== m.creditCol
  return !!m.amountCol
}
```

### 5.2 Pure amount resolver — `src/lib/amount.ts`

Put this in `amount.ts`, **not** `csv-processor.ts`. `csv-structure.ts` needs it, and
`csv-processor.ts` already imports from `csv-structure.ts`, so putting it there would create a
circular import.

```ts
export type SplitAmountResult =
  | { ok: true; amount: number }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'both'; debit: string; credit: string }
  | { ok: false; reason: 'invalid'; side: 'debit' | 'credit'; raw: string }

/**
 * Combine a money-out (debit) cell and a money-in (credit) cell into one signed amount.
 * Never adds/subtracts: exactly one side may carry a non-zero value.
 *   debit x  → -|x|      credit y → +|y|
 *   empty and 0 count as "no value"; a lone zero yields 0.
 */
export function resolveSplitAmount(rawDebit: string | undefined, rawCredit: string | undefined): SplitAmountResult {
  const d = rawDebit?.trim() ?? ''
  const c = rawCredit?.trim() ?? ''
  if (!d && !c) return { ok: false, reason: 'empty' }

  const dv = d ? parseAmount(d, false) : null
  if (d && dv === null) return { ok: false, reason: 'invalid', side: 'debit', raw: d }
  const cv = c ? parseAmount(c, false) : null
  if (c && cv === null) return { ok: false, reason: 'invalid', side: 'credit', raw: c }

  const dNonZero = dv !== null && dv !== 0
  const cNonZero = cv !== null && cv !== 0
  if (dNonZero && cNonZero) return { ok: false, reason: 'both', debit: d, credit: c }
  if (dNonZero) return { ok: true, amount: -Math.abs(dv!) }
  if (cNonZero) return { ok: true, amount: Math.abs(cv!) }
  return { ok: true, amount: 0 } // at least one side was an explicit zero
}
```

Why `Math.abs`? Some banks write debits as `-45.00` in the Debit column and others as `45.00`.
The column, not the number's sign, decides the direction.

**Tests:** create `src/lib/amount.test.ts`:

| Input (debit, credit) | Expected |
|---|---|
| `'45.00'`, `''` | `-45` |
| `'-45.00'`, `''` | `-45` |
| `''`, `'2,000.00'` | `2000` |
| `'1.234,56'`, `''` | `-1234.56` |
| `'(12.50)'`, `''` | `-12.5` |
| `'0.00'`, `'100'` | `100` |
| `'12'`, `'0'` | `-12` |
| `'0.00'`, `''` | `0` |
| `''`, `''` | `{ ok:false, reason:'empty' }` |
| `'  '`, `undefined` | `{ ok:false, reason:'empty' }` |
| `'10'`, `'5'` | `{ ok:false, reason:'both' }` |
| `'abc'`, `''` | `{ ok:false, reason:'invalid', side:'debit' }` |
| `''`, `'n/a'` | `{ ok:false, reason:'invalid', side:'credit' }` |

### 5.3 Parser — `src/lib/csv-processor.ts` `processCSV`

Changes, in order through the function:

1. **Column resolution** (~line 100):
   ```ts
   const split = isSplitMapping(mapping)
   const amountIdx = split ? -1 : colIndex(mapping.amountCol)
   const debitIdx  = split ? colIndex(mapping.debitCol)  : -1
   const creditIdx = split ? colIndex(mapping.creditCol) : -1
   ```
2. **Missing-column check:** in single mode, check `amountCol` as today. In split mode, check
   `debitCol` and `creditCol` instead. Push `mapping.debitCol ?? '(money out)'` etc. so the
   message never says `"undefined"`.
3. **Repair context:** pass the split columns (see §5.4):
   ```ts
   amountIdx: split ? debitIdx : amountIdx,
   creditIdx: split ? creditIdx : undefined,
   ```
4. **`tryRow`:** replace the amount block (current lines ~144, ~150–152, ~164–167) with:
   ```ts
   let amount: number
   if (split) {
     const r = resolveSplitAmount(fields[debitIdx], fields[creditIdx])
     if (!r.ok) {
       const dn = mapping.debitCol, cn = mapping.creditCol
       const msg =
         r.reason === 'empty' ? `Row ${rowNum}: both "${dn}" and "${cn}" are empty`
         : r.reason === 'both' ? `Row ${rowNum}: both "${dn}" (${r.debit}) and "${cn}" (${r.credit}) have values — expected only one`
         : `Row ${rowNum}: "${r.raw}" in "${r.side === 'debit' ? dn : cn}" is not a valid number — is the column correct?`
       return { ok: false, error: msg }
     }
     amount = r.amount
   } else {
     // existing single-column code, unchanged
   }
   ```
   Keep the date check **before** the amount check, as today.
   The order of validation errors users see must not change in single mode.
5. **Duplicate hash:** no change. It is built from the final `amount`, so a transaction hashes
   the same in either mode (R1.6). Add a test for this (below).
6. **Reconciliation** (~line 248): amounts in split mode are already signed by column, so:
   ```ts
   const sign = !split && mapping.amountSign === 'inverted' ? -1 : 1
   ```

**Tests:** add to `src/lib/csv-processor.test.ts` a `describe('processCSV — split debit/credit columns')`:

```ts
const splitMapping: CsvMapping = {
  dateCol: 'Date', descCol: 'Description',
  amountMode: 'split', debitCol: 'Paid out', creditCol: 'Paid in',
  dateFormat: 'DD/MM/YYYY', amountSign: 'normal',
}
const csv = [
  'Date,Description,Paid out,Paid in,Balance',
  '01/03/2026,Tesco,45.20,,954.80',
  '02/03/2026,Salary,,2000.00,2954.80',
  '03/03/2026,Refund,0.00,12.00,2966.80',
].join('\n')
```
Cases:
- All 3 rows parse; amounts `[-45.2, 2000, 12]`; `skippedCount === 0`.
- Row with both empty → skipped, error contains `both "Paid out" and "Paid in" are empty`.
- Row with both non-zero → skipped, error contains `expected only one`.
- `amountSign: 'inverted'` in split mode has **no effect** on the amounts.
- **Hash parity (R1.6):** the same transaction parsed from a single-column CSV
  (`Amount = -45.20`) and from the split CSV gives the same `duplicateHash` for the same
  `accountId`.
- **Missing column:** `debitCol: 'Nope'` → one error starting with `Column(s) not found`.
- **Reconciliation:** add fixture `src/lib/__fixtures__/split-statement-preamble.csv`, a copy
  of `chase-statement-preamble.csv` reshaped to `Date,Description,Debit,Credit,Balance` with
  the same totals. Assert `reconciliation.matched === true`.
- **Regression:** every existing test in the file still passes unchanged. This shows the single
  mode is untouched.

### 5.4 Row repair — `src/lib/csv-structure.ts` `repairRow`

Add an optional field to `RepairContext`:

```ts
/** Split mode only: index of the credit column. `amountIdx` then holds the debit column. */
creditIdx?: number
```

Inside `repairRow`, define `const split = ctx.creditIdx != null && ctx.creditIdx >= 0` and change
three places:

1. **Short row** (line ~284): also require `ctx.creditIdx < fields.length` when split.
2. **Empty typed-column guard** (lines ~292–293): in split mode, leave `amountIdx` and
   `creditIdx` out of `typedIdx`. Then add: if **both** `fields[amountIdx]` and
   `fields[creditIdx]` are blank → `return null`. One empty side is normal in split files and
   must not block repair.
3. **`validate(row)`** (lines ~302–308): in split mode, replace the
   `parseAmount(row[amountIdx]) === null` check with
   `!resolveSplitAmount(row[amountIdx], row[creditIdx!]).ok`, and include `creditIdx` in the
   bounds check.

Also add `creditIdx` to the `isTextMerge` logic? **No.** Only description/notes merges are text
merges. Leave it.

**Tests:** in `src/lib/csv-structure.test.ts`, add a split-mode row with an unquoted comma in
the description:
`'03/03/2026,Zelle to Bob for drain, air handler,155.00,,2545.00'` with header
`Date,Description,Debit,Credit,Balance`. Expect `repairRow` to return the row with the
description re-joined and `155.00` in the Debit slot. Add a second case where the result is
ambiguous and `repairRow` returns `null`.

### 5.5 Heuristics — `src/lib/guess-mapping.ts`

1. Extend `MappedField` with `'debitCol' | 'creditCol'` and add patterns. Headers are compared
   after `norm()`, which lower-cases and strips spaces, `_ - ( ) .`:

   ```ts
   debitCol: {
     exact:    [/^debit$/, /^debits$/, /^paidout$/, /^moneyout$/, /^withdrawal$/, /^withdrawals$/, /^soll$/],
     strong:   [/^debitamount$/, /^amountout$/, /^outgoing$/, /^ausgang$/, /^belastung$/],
     moderate: [/debit/, /withdraw/, /paidout/],
   },
   creditCol: {
     exact:    [/^credit$/, /^credits$/, /^paidin$/, /^moneyin$/, /^deposit$/, /^deposits$/, /^haben$/],
     strong:   [/^creditamount$/, /^amountin$/, /^incoming$/, /^eingang$/, /^gutschrift$/],
     moderate: [/credit/, /deposit/, /paidin/],
   },
   ```
   **Exclusion rule (important):** in `scoreCandidates`, when `field` is `debitCol` or
   `creditCol`, **skip any header whose normalised form contains both `debit` and `credit`**.
   A combined `Debit/Credit` or `DebitCredit` column is one signed amount column, not a
   split. Watch out: `norm()` does **not** strip `/`, so `Debit/Credit` normalises to
   `debit/credit`, not `debitcredit`. That also means the existing `/^debitcredit$/` amount
   pattern never matches `Debit/Credit`. Fix it to `/^debit\/?credit$/` in both the
   `amountCol` patterns and `guessMapping` while you're in this file. Add tests for both.

2. In `guessMapping`, before returning:
   ```ts
   const debitCol  = scoreCandidates(headers, 'debitCol')[0]?.col
   const creditCol = scoreCandidates(headers, 'creditCol')[0]?.col
   const hasPlainAmount = headers.some((h) => norm(h) === 'amount')
   if (debitCol && creditCol && debitCol !== creditCol && !hasPlainAmount) {
     return { ...(dateCol ? { dateCol } : {}), ...(descCol ? { descCol } : {}), ...(notesCol ? { notesCol } : {}),
              amountMode: 'split', debitCol, creditCol, amountSign: 'normal' }
   }
   ```
   Otherwise the result is unchanged (single mode, as today).

**Tests:** create `src/lib/guess-mapping.test.ts`:
- `['Date','Description','Paid out','Paid in','Balance']` → split, Paid out / Paid in.
- `['Buchungstag','Verwendungszweck','Soll','Haben']` → split, Soll / Haben.
- `['Date','Description','Amount','Debit','Credit']` → **single**, `amountCol: 'Amount'`.
- `['Date','Description','Debit/Credit']` → single, `amountCol: 'Debit/Credit'`.
- `['Date','Description','DebitCredit']` → single, `amountCol: 'DebitCredit'`.
- `scoreCandidates(['Debit/Credit'], 'debitCol')` → `[]` (exclusion rule).
- `['Transaction Date','Debit','Memo']` (only one side) → single, `amountCol: 'Debit'`
  (today's behaviour).

### 5.6 API — `src/app/api/upload/route.ts`

Update `MappingSchema`:

```ts
const MappingSchema = z.object({
  dateCol: z.string(),
  descCol: z.string(),
  amountMode: z.enum(['single', 'split']).optional(),
  amountCol: z.string().optional(),
  debitCol: z.string().optional(),
  creditCol: z.string().optional(),
  dateFormat: z.string().optional(),
  amountSign: z.enum(['normal', 'inverted']),
  notesCol: z.string().optional(),
}).refine(isMappingComplete, { message: 'Mapping is missing required amount column(s)' })
```

`/api/transactions/import` needs **no change**: it receives already-computed signed amounts,
re-verifies hashes from `amount`, and stores the mapping as `record<string>`.

`/api/llm/validate-mapping`: no schema change is required (its `mapping` object strips unknown
keys). See §5.8 for how the client guards AI suggestions in split mode.

### 5.7 UI

**New component `src/components/upload/amount-fields.tsx`** (created in PR 0). It now renders:

1. A segmented control, two `<button type="button" aria-pressed>`, labelled
   **Amount format** (copy in PRD §6). Clicking:
   - → split: `setMapping(m => ({ ...m, amountMode: 'split' }))`. Pre-fill `debitCol` /
     `creditCol` from `scoreCandidates(headers, 'debitCol'|'creditCol')[0]` if they're empty.
   - → single: `setMapping(m => ({ ...m, amountMode: 'single' }))`. Don't clear debit/credit;
     switching back restores them.
   - Add `'amountMode'` to `touchedRef` on any click.
2. **Single mode:** today's Amount `ColSelect`, sign select and sign suggestion, unchanged.
3. **Split mode:** two `ColSelect`s:
   - `id="select-debitCol"`, label "Money out (debit) column *", `candidates={candidates.debitCol}`
   - `id="select-creditCol"`, label "Money in (credit) column *", `candidates={candidates.creditCol}`
   - Don't pass `validation` (the AI doesn't know about split).
   - If both are set and equal: red text "Money out and money in must be different columns."
   - Hide the sign select and the sign suggestion.
4. If the initial mapping came from `guessMapping` with `amountMode: 'split'`, show a muted
   hint "Detected separate money out / money in columns." until the user changes mode.

**`column-mapper.tsx`:**
- `isValid` becomes `isMappingComplete(mapping)` (import from `@/lib/csv-processor`).
- The `candidates` state gets `debitCol` and `creditCol` keys. Fill them in the init effect
  with `scoreCandidates(csvHeaders, 'debitCol' | 'creditCol')`.
- The "Select date, amount, and description columns to preview." hint stays as is.

**`hooks/use-mapping-validation.ts`** (inside the `setMapping` callback): skip the
auto-apply for `amountCol` when `m.amountMode === 'split'`:
```ts
if (field === 'amountCol' && m.amountMode === 'split') continue
```

**Sign suggestion** (`showSignSuggestion` in `amount-fields.tsx`): add `&& !isSplitMapping(mapping)`.

### 5.8 Profiles (R1.5)

No code change needed. Verify it manually: `handleImport` already sends `mapping` (with
`amountMode/debitCol/creditCol`) as the profile, and the profile hit already does
`setMapping(profileHit.mapping)`. Q1.6 in §8 covers this.

### 5.9 Type-error checklist (from making `amountCol` optional)

Run `pnpm build` and fix each error. Expected places:

| File | Fix |
|---|---|
| `src/lib/csv-processor.ts` | Covered in §5.3 |
| `src/components/upload/column-mapper.tsx` / `amount-fields.tsx` | Covered in §5.7 |
| `src/app/api/institutions/route.ts`, `src/app/accounts/new/page.tsx`, `new-account-form.tsx`, `src/app/api/bank-agent/{connect,sync}/route.ts` | These *create* mappings with `amountCol` set. They should compile unchanged; if not, keep them in single mode (don't add split support there). |

### 5.10 Done when

- Unit tests in §5.2–§5.5 are added and green; all existing tests are unchanged and green.
- QA Q1.1–Q1.8 pass.
- `CLAUDE.md` → "CSV ingestion" section gets one paragraph describing split mode and
  `resolveSplitAmount` (no arithmetic, both-sides = error).

---

## 6. PR 2 — Import safety and bug fixes

### 6.1 Background tasks scoped to this import (R3.1, R3.2)

**Server — `src/app/api/transactions/import/route.ts`** (lines ~196–212). Collect the job ids:

```ts
const jobIds: string[] = []
if (allImportedIds.length > 0) {
  const results = await Promise.allSettled([
    enqueueJob('invoice-matching', userId, { userId, importedIds: allImportedIds }),
    enqueueJob('receipt-matching', userId, { userId, importedIds: allImportedIds }),
    enqueueJob('rules-agent', userId, { userId }),
  ])
  for (const r of results) {
    if (r.status === 'fulfilled') jobIds.push(r.value)
    else logger.error('import', 'failed to enqueue job', { message: r.reason instanceof Error ? r.reason.message : String(r.reason) })
  }
}
return ok({ imported: totalImported, skipped: totalSkipped, batchIds, jobIds })
```
(`enqueueJob` only awaits a DB insert; the job itself drains in the background, so awaiting the
rules-agent enqueue adds only a few ms.)

**Server — `src/lib/background-jobs.ts`:** add

```ts
export async function getJobsByIds(userId: string, ids: string[]) {
  if (ids.length === 0) return []
  return prisma.backgroundJob.findMany({
    where: { userId, id: { in: ids } },     // userId scope is mandatory
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, status: true, attempts: true, lastError: true, createdAt: true, completedAt: true },
  })
}
```

**Server — `src/app/api/jobs/recent/route.ts`:** accept an optional `ids` query param
(comma-separated, max 20). When present, return `getJobsByIds(userId, ids)`. Otherwise use the
existing behaviour. Extend the zod `QuerySchema`:
```ts
ids: z.string().optional().transform((s) => s ? s.split(',').filter(Boolean).slice(0, 20) : undefined),
```

**Types:** `UploadState.lastImport` in `src/types/index.ts` becomes
```ts
lastImport: { imported: number; skipped: number; unreadable: number; jobIds: string[] } | null
```
and `setLastImport` in `upload-store.ts` follows. In `use-import-submit.ts`, set
`unreadable: skippedCount` (pass it in from the preview hook) and `jobIds: json.data?.jobIds ?? []`.

**Client — `upload-page-client.tsx`:** rewrite the two polling effects (lines ~73–110) as one:
- If `step !== 'done'` or `lastImport.jobIds.length === 0` → do nothing and render **no**
  tasks section (delete the "Loading task status..." fallback for this case).
- Otherwise fetch `/api/jobs/recent?ids=${jobIds.join(',')}` immediately, then every 2s.
- Stop when every job is `DONE` or `FAILED`, **or** after 60 polls (2 minutes). In the
  timeout case set `tasksTimedOut = true` and render the timeout copy (PRD §6).
- Clear the interval on unmount (as today).
- Show "Loading task status…" only while `jobIds.length > 0` and the first response hasn't
  arrived.

### 6.2 Busy drop feedback (R3.3) — `csv-dropzone.tsx`

- Add state `const [busyNotice, setBusyNotice] = useState(false)`.
- In `handleFiles`, replace `if (busyRef.current) return` with:
  ```ts
  if (busyRef.current) { setBusyNotice(true); return }
  ```
- Clear it (`setBusyNotice(false)`) at the end of the `finally` block.
- Render under the dropzone label: `{busyNotice && <p className="mt-2 text-xs text-amber-700" role="status">Still reading the previous file — try again in a moment.</p>}`
- The `<input>` is already `disabled` while processing, so this mainly fires on drag-and-drop.
  That's expected.

### 6.3 "Start over" with confirmation (R3.4)

Create `src/components/upload/confirm-dialog.tsx`, a small reusable wrapper around the existing
shadcn `Dialog` (`src/components/ui/dialog.tsx`):

```tsx
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, destructive, onConfirm, onCancel, children }: {...}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{body && <DialogDescription>{body}</DialogDescription>}</DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```
(`Button` supports `variant="destructive"` and `variant="outline"`; `Dialog` is a base-ui
wrapper that accepts `open` / `onOpenChange`.)

In `column-mapper.tsx`:
- Replace the Cancel button with a text button: `Start over`
  (`className="w-full text-xs text-muted-foreground hover:underline"`, keep
  `data-testid="cancel-import-btn"`).
- Clicking it opens `ConfirmDialog` (title/body/buttons from PRD §6). Confirm → `reset()`.

### 6.4 Confirm before a partial import (R2.1, R2.2)

In `column-mapper.tsx` (or a small `import-confirm.tsx` if you're near the line cap):
- `const hasMismatch = reconciliations.some((r) => !r.matched)`
- Import button `onClick`: if `skippedCount > 0 || hasMismatch` → open `ConfirmDialog`;
  otherwise call `submit()` straight away.
- Dialog content:
  - If `skippedCount > 0`: "**{skippedCount}** rows couldn't be read and won't be imported."
    plus a `<ul>` of `parseErrors.slice(0, 5)` (text-xs, amber).
  - If `hasMismatch`: reuse `<ReconciliationNotices items={reconciliations.filter(r => !r.matched)} />`.
  - Cancel label "Go back and fix"; confirm label `Import ${newCount} transactions anyway`.
  - Confirm → close dialog → `submit()`.

### 6.5 Done-dialog copy (R2.3)

In `upload-page-client.tsx`, add ` · ${lastImport.unreadable} rows couldn't be read` to the
description when `unreadable > 0`.

### 6.6 Done when

QA Q2.1–Q2.7 pass. `pnpm lint && pnpm test && pnpm build` green. Optional: add a unit test for
the `ids` transform if you move it to a helper.

---

## 7. PR 3 — UX polish

### 7.1 Account auto-select (R4.1, R4.2)

`account-rail.tsx`:
- Add a `useEffect`: if `!loadingAccounts && accounts.length === 1 && !accountId`, call
  `onAccountIdChange(accounts[0].id)`.
- Add a prop `preselectedFromProfile: boolean`. `ColumnMapper` passes
  `!!profileHit?.accountId && accountId === profileHit.accountId`. When true, render the PRD §6
  note (`text-[10px] text-muted-foreground mt-1`).

Note on timing: `setProfileHit` (store) sets `accountId` when a profile has one, and it can arrive
*after* the auto-select. That's fine: the profile choice overrides, which is the correct
precedence.

### 7.2 Sample values in dropdowns (R4.3)

- In `column-mapper.tsx`, compute once per first file:
  ```ts
  const samples = useMemo(() => {
    const f = files[0]; if (!f) return {}
    const { headers, rows } = analyzeCsv(f.csvText)
    const out: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (!h || h in out) return
      const v = rows.slice(0, 50).map((r) => r[i]?.trim()).find(Boolean)
      if (v) out[h] = v.length > 24 ? v.slice(0, 23) + '…' : v
    })
    return out
  }, [files[0]?.csvText])
  ```
- `ColSelect` gets an optional `samples?: Record<string, string>` prop. Add a helper inside
  `col-select.tsx`:
  ```ts
  const label = (h: string, pct?: number) =>
    [h, pct != null ? `${pct}%` : null, samples?.[h] ? `e.g. ${samples[h]}` : null].filter(Boolean).join(' — ')
  ```
  Use it for every `<option>` (suggested and all-columns). This keeps the CLAUDE.md rule that
  confidence goes inside the option text. Update that CLAUDE.md note to mention the sample suffix.
- Pass `samples` to every `ColSelect`, including the split-mode ones.

### 7.3 Single file list + add-more in the rail (R5.1, R5.2)

- `upload-page-client.tsx`: delete the `files.length > 1` chip block (lines ~171–187). Render
  `<CsvDropzone />` **only** when `step === 'upload'`.
- New `src/components/upload/file-list-panel.tsx`: the rail's file list (moved from
  `column-mapper.tsx` lines ~253–272, shown for 1+ files, not just >1) followed by
  `<CsvDropzone compact />`. Rail width is `w-72`, so in compact mode change the dropzone wrapper
  from `max-w-lg` to `w-full` (add the class conditionally on `compact`).
- Compact-mode copy: "+ Add files with the same columns".
- `ColumnMapper` renders `<FileListPanel importing={importing} />` where the old list was. The
  "Map columns / filename" header stays above it.

### 7.4 Pinned Import button (R5.3)

The rail is `w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto`. Wrap the Import button,
the "Start over" link and the error in:
```tsx
<div className="sticky bottom-0 -mx-1 mt-auto bg-background px-1 pt-3 pb-1 border-t space-y-2">
```
`sticky` works because the rail itself is the scroll container. Check that the page's
`main` keeps the rail's height bounded (`h-full min-h-0` is already on the mapper root). If
the rail grows the page instead of scrolling, add `max-h-[calc(100vh-10rem)]` to the rail.

### 7.5 Reconciliation banner (R5.4)

In `preview-summary.tsx`:
- Keep matched items inline (green ✓).
- Render mismatched items as a block **below** the stats row:
  `<div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">`.
- Simplest approach: give `ReconciliationNotices` a `variant: 'inline' | 'banner'` prop, and
  call it twice with filtered `items`.

### 7.6 Progress indicator (R5.5)

`upload-page-client.tsx`: `STEPS` labels become `'Upload'` and `'Map & import'`. Keep the
internal keys lower-case so `toDisplayStep` still works; use a `{ key, label }` array. A step
whose index is less than the current one shows `✓` instead of its number.

### 7.7 Done dialog actions (R6.1, R6.2)

`upload-page-client.tsx`:
```ts
async function finishOnboardingIfNeeded() {
  if (!onboarding) return
  await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ onboardingStep: 'done' }) })
}
async function handleImportAnother() {
  await finishOnboardingIfNeeded()
  reset()
  if (onboarding) router.replace('/upload')   // drop ?onboarding=1
}
async function handleGoToTransactions() {
  await finishOnboardingIfNeeded()
  reset()
  router.push('/transactions')
}
```
Footer: `<Button variant="outline" onClick={handleImportAnother}>Import another file</Button>`
then `<Button onClick={handleGoToTransactions}>Go to transactions</Button>`.
Update the CLAUDE.md "Upload flow — two steps, Dialog on completion" section to match.

### 7.8 Naming (R7.1)

| File | Change |
|---|---|
| `src/app/upload/page.tsx` | `metadata.title` → `'Import transactions — Backoffice AI'` |
| `src/components/layout/sidebar.tsx` (`IMPORT_ITEMS`) | `'Upload CSV'` → `'Import transactions'` |
| `src/components/transactions/toolbar/bulk-delete-bar.tsx` | `↑ Upload CSV` → `↑ Import` |
| `src/components/upload/upload-page-client.tsx` | Header title already says "Import Transactions"; change to sentence case "Import transactions" |
| `src/app/upload/page.capabilities.ts` | Add Excel and separate debit/credit columns to `purpose`/`jobsToBeDone`; then run `pnpm run build:capabilities` and commit the regenerated file |

### 7.9 AI mapping changes: highlight + Undo/Keep (R8.1–R8.6)

**Where the silent write happens today:** `src/components/upload/hooks/use-mapping-validation.ts`,
in the `.then` after `POST /api/llm/validate-mapping`. Inside a `setMapping((m) => …)` updater it
overwrites any field where `confidence >= 99`, the column exists in `csvHeaders`, and the field
isn't in `touchedRef`.

**Building blocks that already exist (reuse them, don't rewrite):**
- `src/hooks/use-pending-ai-changes.ts`: `usePendingAiChanges<T>()` →
  `{ pendingFields, hasPendingChanges, markPending(field, snapshot), confirm(), undo(apply) }`.
  It keeps a snapshot of state from *before* the first AI change.
- `.ai-changed` CSS class in `src/app/globals.css` (already turned off under
  `prefers-reduced-motion`).
- Reference implementation: `src/components/projects/quote-editor.tsx` (~lines 219–234).

#### Step 1 — Pure function (tested): `src/lib/ai-mapping-changes.ts`

Pull the "which fields would the AI change?" decision out of React so it can be unit-tested:

```ts
import type { CsvMapping } from '@/lib/csv-processor'

export const AI_AUTO_APPLY_THRESHOLD = 99
export type AiMappedField = 'dateCol' | 'amountCol' | 'descCol' | 'notesCol'
export interface AiMappingChange { field: AiMappedField; from: string | undefined; to: string }

/** Fields the AI should auto-apply. Never touches user-edited fields, unknown columns,
 *  no-op changes, or amountCol in split mode. */
export function computeAiMappingChanges(
  mapping: Partial<CsvMapping>,
  ai: Partial<Record<AiMappedField, { col: string | null; confidence: number }>>,
  touched: ReadonlySet<string>,
  headers: string[],
): AiMappingChange[] {
  const out: AiMappingChange[] = []
  for (const field of ['dateCol', 'amountCol', 'descCol', 'notesCol'] as const) {
    const v = ai[field]
    if (!v?.col || v.confidence < AI_AUTO_APPLY_THRESHOLD) continue
    if (!headers.includes(v.col)) continue
    if (touched.has(field)) continue
    if (field === 'amountCol' && mapping.amountMode === 'split') continue
    if (mapping[field] === v.col) continue          // R8.6 — AI agrees, nothing to show
    out.push({ field, from: mapping[field], to: v.col })
  }
  return out
}
```

**Tests:** create `src/lib/ai-mapping-changes.test.ts` covering:
- 99 → applied; 98 → not applied.
- Column not in headers → not applied.
- Touched field → not applied.
- Same value as current → not in result (R8.6).
- `amountCol` in split mode → not applied.
- `from` is `undefined` when the field was empty.
- `col: null` → not applied.

#### Step 2 — Hook: `use-mapping-validation.ts`

1. Add a `mappingRef` kept in sync with `mapping` via `useEffect` (the CLAUDE.md "stateRef"
   pattern). It lets the async `.then` read the latest mapping without adding `mapping` to the
   effect's deps, which would re-run the LLM call on every edit.
2. Call `usePendingAiChanges<Partial<CsvMapping>>()` inside the hook.
3. Replace the auto-apply block in `.then` with:
   ```ts
   const changes = computeAiMappingChanges(mappingRef.current, j.data, touchedRef.current, csvHeaders)
   if (changes.length > 0) {
     for (const c of changes) markPending(c.field, mappingRef.current)   // snapshot = before AI
     setAiChanges(changes)
     setMapping((m) => {
       const next = { ...m }
       for (const c of changes) if (!touchedRef.current.has(c.field)) next[c.field] = c.to
       return next
     })
   }
   ```
   **Don't** call `markPending` *inside* the `setMapping` updater. Updaters must be pure, and
   React StrictMode runs them twice in dev.
4. Keep `const [aiChanges, setAiChanges] = useState<AiMappingChange[]>([])` so the banner can
   show `from → to`.
5. Expose from the hook:
   ```ts
   return {
     validation, validating,
     aiPendingFields: pendingFields,          // ReadonlySet<string>
     aiChanges: aiChanges.filter((c) => pendingFields.has(c.field)),
     keepAiChanges: () => { confirm(); setAiChanges([]) },
     undoAiChanges: () => {
       const fields = [...pendingFields]
       undo((snap) => setMapping((m) => {
         const next = { ...m }
         for (const f of fields) next[f as AiMappedField] = snap[f as AiMappedField]
         return next
       }))
       setAiChanges([])
     },
     clearAiField: (field: string) => { /* see Step 3 */ },
   }
   ```
   Undo restores **only the AI-changed fields** from the snapshot, not the whole mapping.
   Restoring everything would wipe the detected date format or user edits made since.

#### Step 3 — Per-field confirm (R8.3): small extension to the shared hook

`usePendingAiChanges` has no way to clear a single field. Add one in a **backwards-compatible**
way, so the existing callers (invoice / estimate / quote editors) are unaffected:

```ts
// src/hooks/use-pending-ai-changes.ts
const clearField = useCallback((field: string) => {
  setPendingFields((prev) => {
    if (!prev.has(field)) return prev
    const next = new Set(prev); next.delete(field)
    if (next.size === 0) snapshotRef.current = null
    return next
  })
}, [])
// …add clearField to the returned object
```

In `use-mapping-validation.ts`, `clearAiField = (f) => clearField(f)`. In `column-mapper.tsx`,
the existing `set(field)` handler (it already does `touchedRef.current.add(field)`) also calls
`clearAiField(field)`.

#### Step 4 — UI

- **`col-select.tsx`:** new optional prop `aiChanged?: boolean`. When true, add
  `ai-changed` to the outer `<div>` along with `p-1 -m-1` so the glow has room.
  `ColumnMapper` (and `AmountFields` for the amount column) passes
  `aiChanged={aiPendingFields.has('<field>')}`.
- **New `src/components/upload/ai-mapping-banner.tsx`:** the rail is narrow (`w-72`), so don't
  reuse `AiConfirmBanner` from `components/projects/`. Its horizontal layout and fixed copy
  ("…highlighted fields above") don't fit. Copy its styling (`border-primary/30 bg-primary/8`,
  `Sparkles` / `Undo2` / `CheckCircle` icons from `lucide-react`) in a **stacked** layout:
  ```
  ✦ AI updated your column mapping
    AI changed Amount: Betrag → Umsatz
    AI changed Description: none → Verwendungszweck
  [Undo] [Keep]
  ```
  Field labels: `dateCol` → Date, `amountCol` → Amount, `descCol` → Description,
  `notesCol` → Notes. Show `from` as `none` when it's `undefined`.
  Add `role="status"` so screen readers announce it.
- **`column-mapper.tsx`:** render
  `{aiChanges.length > 0 && <AiMappingBanner changes={aiChanges} onUndo={undoAiChanges} onKeep={keepAiChanges} />}`
  directly under the "Map columns" heading.
- **Import (R8.4):** in the Import click handler (in the PR 2 version this is the function that
  decides whether to open the confirm dialog), call `keepAiChanges()` first.

#### Step 5 — Docs

In `CLAUDE.md`, under "AI write actions — always use the HITL confirm pattern", add one line:
*"Upload column mapper: `use-mapping-validation.ts` auto-applies ≥99% suggestions but marks them
pending (highlight + Undo/Keep banner, `ai-mapping-banner.tsx`); decision logic in
`src/lib/ai-mapping-changes.ts`."*

### 7.10 Done when

QA Q3.1–Q3.12 pass. Lint/test/build green. `pnpm run build:capabilities --check` passes.
The existing invoice/quote/estimate AI banners still work (open one editor, trigger an AI
change, Undo). This confirms the `clearField` addition didn't break them.

---

## 8. Manual QA

Run `pnpm dev`, sign in with a dev user that has at least 2 accounts (plus one user with
exactly 1 account for Q3.1). Save the test files below somewhere local; the `__fixtures__`
ones are in `src/lib/__fixtures__/`.

**Test files to create** (also commit the first two as fixtures):

`split-basic.csv`
```
Date,Description,Paid out,Paid in,Balance
01/03/2026,Tesco,45.20,,954.80
02/03/2026,Salary,,2000.00,2954.80
03/03/2026,Refund,0.00,12.00,2966.80
04/03/2026,Coffee,"3,50",,2963.30
```
`split-bad-rows.csv`: same header, plus one row with both columns empty and one row with both
filled.

### PR 0
- Q0.1 Drop `chase-statement-preamble.csv` → mapping pre-filled, preview shows, the
  reconciliation notice shows.
- Q0.2 Change the amount column → preview updates. Toggle the sign → amounts flip.
- Q0.3 Import → done dialog → OK → lands on `/transactions`.

### PR 1
- Q1.1 Drop `split-basic.csv` → opens in **split** mode with Paid out / Paid in pre-selected
  and the "Detected…" hint.
- Q1.2 Preview shows -45.20, +2000.00, +12.00, -3.50. No unread rows.
- Q1.3 The sign select and sign suggestion are hidden in split mode.
- Q1.4 Choose the same column for both → red message, preview clears, Import disabled.
- Q1.5 Switch to "One amount column" and back → previous debit/credit choices restored.
- Q1.6 Import `split-basic.csv`. Start a new upload of the same file → the "Saved mapping"
  banner shows, split mode restored, **all rows marked duplicate**.
- Q1.7 Drop a single-column CSV (e.g. `n26-semicolon-preamble.csv`) → single mode, behaves as
  before.
- Q1.8 Drop `split-bad-rows.csv` → 2 rows "could not be parsed" with the PRD wording.

### PR 2
- Q2.1 Import a file with all rows already imported → "Nothing new to import", **no** tasks
  section, and no polling in the Network tab.
- Q2.2 Import new rows → the tasks section lists exactly 3 tasks (Invoice matching, Receipt
  matching, Categorization) and polling stops once all finish.
- Q2.3 Network tab: the request is `/api/jobs/recent?ids=…`.
- Q2.4 Drop a PDF, and while it's processing drop a CSV → the busy message appears; the CSV
  isn't added.
- Q2.5 "Start over" → confirm dialog → "Keep editing" keeps state; "Discard" resets.
- Q2.6 With `split-bad-rows.csv`, click Import → confirm dialog lists the errors →
  "Go back and fix" does nothing → "Import N anyway" imports; the done dialog mentions
  "2 rows couldn't be read".
- Q2.7 With a clean file, Import → no confirm dialog.

### PR 3
- Q3.1 User with 1 account: drop a file → account already selected, preview loads with no
  clicks.
- Q3.2 Re-upload a previously imported format with 2+ accounts → account pre-selected and the
  note is visible.
- Q3.3 Column dropdowns show `— e.g. …` samples; long values are truncated with "…".
- Q3.4 Multi-file upload: the file list appears only once (in the rail); the add-more dropzone is
  in the rail; the top-of-page dropzone is gone on the mapping step.
- Q3.5 Shrink the window height → the Import button stays visible at the bottom of the rail.
- Q3.6 Reconciliation mismatch shows as an amber banner above the table.
- Q3.7 Done dialog → "Import another file" → back to an empty upload step on `/upload`.
  In onboarding (`/upload?onboarding=1`) the query param is gone afterwards.
- Q3.8 Sidebar, tab title and transactions toolbar all say "Import".
- Q3.9 **Forcing an AI change:** to test this reliably, temporarily set
  `AI_AUTO_APPLY_THRESHOLD = 0` locally (don't commit). Alternatively, use a file whose headers
  fool the heuristic, e.g. `Datum,Text,Betrag,Umsatz` with signed values only in `Umsatz`. Drop
  it → the changed dropdown(s) pulse and the banner lists `from → to`.
- Q3.10 Click **Undo** → previous values restored, the preview updates, and the highlight and
  banner disappear. Repeat and click **Keep** → AI values stay, the highlight and banner
  disappear.
- Q3.11 With two fields changed, edit one by hand → its highlight goes away and it leaves the
  banner; the other stays.
- Q3.12 With changes pending, click Import → imports normally, and the banner is gone if you
  come back. With "reduce motion" on in the OS, the highlight is static (no pulsing).

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A parser change breaks existing single-column imports | Single-mode code path is unchanged; the full existing test suite must pass untouched; Q1.7 |
| Split detection misfires on a file that has a signed Amount column too | Rule: any column named exactly "Amount" forces single mode; unit test in §5.5 |
| Duplicate imports after a user switches a profile between modes | Hash depends only on the final signed amount; parity test in §5.3; Q1.6 |
| Old clients/profiles send mappings without `amountMode` | `undefined` → single everywhere via `isSplitMapping`; zod field is optional |
| Line cap exceeded mid-PR | PR 0 frees roughly 140 lines; add new UI as sibling files, never inline |
| Changing the shared `usePendingAiChanges` hook breaks the invoice/quote/estimate editors | Only *add* `clearField`; don't change existing methods; regression check in §7.10 |
| The AI response lands after the user has edited fields | `computeAiMappingChanges` reads `touchedRef` at response time, and the `setMapping` updater re-checks it |

## 10. Rollback

Every PR is a plain revert. No schema or data migrations. Profiles saved with
`amountMode: 'split'` after PR 1 have no `amountCol`. If PR 1 is reverted, their preview fails:
the old `/api/upload` zod schema rejects the missing `amountCol` with a 400. The user can fix it
by clicking "Re-detect columns". This is
acceptable, but if PR 1 is reverted in production, notify users who imported split files.

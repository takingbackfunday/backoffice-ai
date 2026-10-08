# PRD: Statement upload hardening (CSV / Excel / PDF)

Status: Ready for implementation · Owner: Samuel · Implementation spec: `sdd.md`

## 1. Background

The `/upload` flow imports bank transactions from CSV, Excel (`.xlsx`/`.xls`) and PDF statements:

```
dropzone (client) ── CSV text ──▶ column mapper ──▶ POST /api/upload (preview) ──▶ POST /api/transactions/import
   ├─ .csv  → read as text
   ├─ .xlsx → SheetJS in the browser → CSV text
   └─ .pdf  → POST /api/upload/pdf (Mistral OCR + LLM) → CSV text
```

A quality review (2026-10-08) found that the pure parsing core (`csv-structure`, `csv-processor`, `amount`,
`date-format`) is solid and well tested, but the surrounding layers have defects that **silently corrupt or lose
financial data**, plus reliability, security and UX gaps. This PRD covers fixing them.

## 2. Problems (evidence)

| ID | Problem | User impact | Evidence |
|---|---|---|---|
| P1 | Excel dates shift one day earlier for users west of UTC. | Every Excel-imported transaction has the wrong date for US users. | `TZ=America/Los_Angeles npx vitest run src/lib/excel.test.ts` fails: `2026-01-14` instead of `2026-01-15`. |
| P2 | The preview table shows dates one day early for users west of UTC (display only, stored data is right). | Users think the import is wrong, or don't notice P1. | `new Date('2026-01-15T00:00:00Z').toLocaleDateString()` → `1/14/2026` in New York. |
| P3 | Genuine repeat transactions (same account, date, amount, description) collapse into one. | Silent data loss (e.g. two identical transit fares on the same day). Preview says "2 new", import says "imported 2", the DB has 1. | `dedup.ts` hash has no occurrence component; `Transaction.duplicateHash @unique`; `createMany({ skipDuplicates: true })`. |
| P4 | The import API trusts the client completely: no date validation, client-chosen hash, `categoryId`/`payeeId` not checked for ownership. | Junk dates cause a 500; users can link transactions to another tenant's category or payee. | `src/app/api/transactions/import/route.ts`. |
| P5 | Imports aren't atomic, the error handler doesn't log, and counts are wrong. | A partial failure leaves half an import and orphan batches, and nothing shows up in the logs. | Same file: no `$transaction`; `catch {}`; `rowCount = newRows.length`. |
| P6 | The success dialog always says "imported successfully". | The user doesn't learn that 0 rows, or fewer rows than expected, were saved. | `upload-page-client.tsx` ignores the import response. |
| P7 | The AI mapping check races the saved-profile lookup and overwrites the mapping, including user edits and the amount sign. It doesn't check that returned columns exist. | Non-deterministic mapping; amounts can be silently sign-flipped. | `column-mapper.tsx` LLM effect. |
| P8 | Once one file is accepted, the dropzone unmounts. Rejection errors and pending Excel sheet pickers vanish, and files can't be added during mapping. | Files silently disappear from the session. | `upload-page-client.tsx:162`. |
| P9 | Double drops aren't blocked; Excel parsing has no progress indicator; PDF size is only checked server-side. | Duplicate expensive PDF calls; the UI looks frozen; 10 MB+ uploads fail late. | `csv-dropzone.tsx`. |
| P10 | PDF route: no timeouts on Mistral/OpenRouter, no daily AI budget check, strict `application/pdf` MIME requirement, no PDF magic-byte check. | Requests can hang; unbounded AI cost; some valid PDFs are rejected. | `api/upload/pdf/route.ts`, `ocr/mistral.ts`, `llm/openrouter.ts`. |
| P11 | The preview builds rows with a quadratic `allRows.find` lookup. | Slow or timed-out preview on large multi-file uploads. | `api/upload/route.ts:102`. |
| P12 | The preview silently shows only the first 100 rows. | Users think rows are missing. | `preview-table.tsx`. |
| P13 | Accessibility gaps: no visible keyboard focus on the dropzone, no `aria-current` on the step indicator, preview status not announced, animations ignore reduced-motion. | Keyboard, screen-reader and motion-sensitive users are underserved. | Upload components. |
| P14 | `column-mapper.tsx` is 478 lines, over the repo's 400-line limit. | Hard to change safely. | `CLAUDE.md` component size cap. |

## 3. Goals

1. **No silent data change.** Every transaction in the file is stored once, with the correct calendar date and sign, in every timezone.
2. **Server is the authority.** The import API validates input, checks ownership and is atomic.
3. **Honest feedback.** The user sees exactly what was imported, skipped and rejected.
4. **Bounded external calls.** AI calls have timeouts and respect the per-user daily budget.
5. **Accessibility baseline** for the upload screens.

## 4. Non-goals (explicitly out of scope)

- PDF chunking for very long statements, or reconciling PDF totals.
- Server-side caching or re-parsing of uploaded files (the preview still re-sends CSV text).
- Migrating amounts from JS numbers to `Decimal` in the parsing pipeline.
- New formats (OFX/QIF/CAMT), text-encoding detection, separate debit/credit CSV columns.
- Persisting the upload session across page reloads.
- `src/lib/rules/evaluate-condition.test.ts` "dayOfWeek" failing under `TZ=America/Los_Angeles` (separate bug).
- Bank-agent routes (`bank-agent/connect`, `bank-agent/sync`), beyond inheriting the dedup fix automatically.
- Any Prisma schema change.

## 5. Requirements

### R1: Timezone-independent Excel dates (P1)
- An Excel date cell converts to the same `yyyy-mm-dd` calendar date in every timezone, for `.xlsx` and `.xls`, and for both the 1900 and 1904 date systems.
- Date-time cells keep only the calendar date.
- Number cells still export at full stored precision (`1234.56`, not `1,235`).
- **Acceptance:** the Excel test suite passes under `TZ=UTC`, `America/Los_Angeles` and `Pacific/Auckland`; CI runs the ingestion tests in a non-UTC timezone.

### R2: Correct preview dates (P2)
- Preview dates render as the stored calendar date, in UTC.
- **Acceptance:** `2026-01-15T00:00:00.000Z` renders as Jan 15 in any browser timezone.

### R3: Repeat transactions survive (P3)
- The Nth identical row (same account, date, amount and lowercased trimmed description) *within one file* gets a distinct hash.
- The first occurrence's hash is **byte-identical to today's**, so existing data still deduplicates.
- Re-importing the same file imports 0 new rows.
- Two files in one session that overlap on the same statement period: the overlapping rows in the second file are marked duplicate in the preview and are not imported twice.
- **Acceptance:** a file with two identical rows previews "2 new" and stores 2 rows; re-uploading it previews "0 new / 2 duplicates".

### R4: Trustworthy import API (P4, P5)
- **Validation:**
  - `date` must be an ISO datetime.
  - `amount` must be finite with an absolute value below 10,000,000,000 (fits `Decimal(12,2)`).
  - `occurrence` must be a non-negative integer (optional, default 0).
- The server recomputes each row's hash. A mismatch with the client's hash returns 400 "Import data is out of date — please refresh the preview."
- `categoryId` and `payeeId` that don't belong to the user are replaced with `null` (and logged as a warning). They never cause a cross-tenant link.
- **Atomicity:** all writes for one import request (batches, transactions, `lastImportAt`) commit together or not at all.
- **Counts:** batch `rowCount`/`skippedCount` and the `imported`/`skipped` response values reflect rows actually inserted.
- **Logging:** errors are logged with the `import` component and the message before returning 500.

### R5: Honest completion dialog (P6)
- The dialog shows "Imported N transactions", plus "M skipped as duplicates" when M > 0.
- When N = 0 the title is "Nothing new to import" instead of "Import complete!".

### R6: Safe AI mapping assist (P7)
- The AI check runs only after the saved-profile lookup has finished, and never when a profile matched.
- The AI may auto-fill a column field only if: confidence ≥ 99, the column exists in the file's headers, and the user hasn't changed that field this session.
- The AI **never** changes the amount sign automatically. If it suggests the other sign with confidence ≥ 90, an inline notice offers a one-click switch.
- The validate-mapping API returns 400 for a bad request body, validates the LLM output shape (500 if invalid), and times out after 30 s.

### R7: The dropzone survives the mapping step (P8, P9)
- During mapping, a compact dropzone ("Add more files") stays visible above the mapper. Errors and pending sheet pickers stay visible until dismissed or until the next drop.
- While any file is processing, new drops and file selections are ignored; a spinner shows for Excel ("Reading workbook…") and PDF (existing copy).
- PDFs over 10 MB are rejected in the browser with "PDF too large (max 10 MB)." before any upload.

### R8: Bounded PDF extraction (P10)
- Mistral OCR times out at 90 s and the LLM extraction at 120 s, each with a clear error.
- The route checks the user's daily AI budget first, returns 429 with a friendly message when it's exceeded, and records estimated usage afterwards.
- Any `data:*;base64,` URI is accepted as long as the decoded bytes start with `%PDF-`; otherwise 400 "This file is not a valid PDF."

### R9: Preview performance and clarity (P11, P12)
- Preview row assembly is linear in the number of rows.
- When there are more than 100 rows, a caption reads "Showing first 100 of N rows".

### R10: Accessibility baseline (P13)
- The dropzone shows a visible focus ring when its file input has keyboard focus.
- The step indicator marks the current step with `aria-current="step"`.
- The preview status line is a polite live region.
- The throb animations are disabled under `prefers-reduced-motion: reduce`.
- The import button's accessible name matches its visible text, including "Importing…".

### R11: Maintainability (P14)
- `column-mapper.tsx` is ≤ 400 lines, with logic split into hooks and leaf components. No behaviour change.

## 6. Success metrics

- 0 failing ingestion tests under UTC, Los Angeles and Auckland timezones in CI.
- Stored row count equals the previewed "new" count for every import (the response's `imported` equals the number of rows sent minus rows already in the DB).
- No uncaught 500s from `/api/transactions/import` for malformed input (they become 400s).

## 7. Rollout and risk

- No DB migration. Hash compatibility is kept for first occurrences, so existing data is unaffected.
- Risk: a user who had *already* lost repeat transactions will now see the missing repeat as "new" on re-upload. That's desired: it restores lost data.
- Ship as one PR; deploy via the normal push to `main` after CI is green.

# SDD-03 — Saved Import Profiles & Multi-File Upload

Status: Draft · Date: 2026-07-24 · PRD: `prd-03-import-profiles-multifile.md` · Effort: L (6–9 days)

## Current-state facts (verified)

- Store (`src/stores/upload-store.ts`): single-file — one `filename`,
  `csvHeaders[]`, `csvText`; steps `upload → map-columns → preview → done`.
- Dropzone (`csv-dropzone.tsx`): `files[0]` only (line 86), no `multiple`
  attribute; CSV parsed client-side (Papa, headers only); PDF →
  `POST /api/upload/pdf` → synthesized CSV with fixed headers
  `['Date (YYYY-MM-DD)', 'Description', 'Amount', 'Notes']` → converges into the
  same store state.
- Mapping detection (`column-mapper.tsx`): `guessMapping()` (regex, lines 88-124)
  runs on header change; **unconditional** LLM call to
  `POST /api/llm/validate-mapping` with headers + 20 sample rows (lines 398-428);
  LLM overrides fields only at ≥99 confidence.
- Persistence: **none** for confirmed mappings. `InstitutionSchema.csvMapping` is
  written only with placeholders (`column-mapper.tsx:232`,
  `accounts/new/page.tsx:79`) and never read at upload. `ImportBatch` =
  `{ accountId, filename, rowCount, skippedCount }`.
- Preview: `POST /api/upload` takes `{ accountId, csvText, mapping }` — one file.
  Import: `POST /api/transactions/import` takes `{ accountId, filename, rows }` —
  one batch; dedup via account-scoped `duplicateHash` + `createMany skipDuplicates`.
- Account selection: single `accountId` per session, inside `ColumnMapper`.
- `ImportPreview` component is dead code; live preview lives in `ColumnMapper`.
- `column-mapper.tsx` is ~660+ lines (already over the 400-line cap).

## Design

### A. Data model — `ImportProfile`

```prisma
model ImportProfile {
  id           String   @id @default(cuid())
  userId       String
  signature    String                 // sha256 of normalized headers
  headers      Json                   // string[] as uploaded
  mapping      Json                   // CsvMapping { dateCol, amountCol, descCol, dateFormat, amountSign, notesCol? }
  accountId    String?
  source       String   @default("csv") // 'csv' | 'pdf'
  useCount     Int      @default(1)
  lastUsedAt   DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([userId, signature])
  @@index([userId])
}
```

- `pnpm db:push` **before deploy** (schema-drift gotcha).
- Not a relation to `Account` (loose `accountId` string is fine; account deletion
  shouldn't cascade into profiles). No backfill needed.

**Signature** — `src/lib/import-signature.ts` (pure, unit-tested):

```ts
export function headerSignature(headers: string[]): string {
  const normalized = headers.map((h) => h.trim().toLowerCase()).sort()
  return createHash('sha256').update(normalized.join('\n')).digest('hex')
}
```

Sort makes it column-order independent; mapping is by column name, so order is
irrelevant. CSV and its own re-export months later hash identically. PDFs all
hash to the one fixed signature of `STATEMENT_CSV_HEADERS`.

### B. API

| Route | Change |
|---|---|
| `GET /api/import-profiles?signature=` | Return the user's profile for a signature (or 404). `authedRoute`. |
| `DELETE /api/import-profiles/[id]` | Phase 2 (manageability); stub optional. |
| `POST /api/transactions/import` | Body gains optional `profile: { headers: string[], mapping: CsvMapping, source: 'csv' \| 'pdf' }`. After successful import, upsert `ImportProfile` on `(userId, signature)` — set mapping, headers, accountId, `useCount: { increment: 1 }`, `lastUsedAt: now()`. Best-effort: wrap in try/catch, never fail the import. |
| `POST /api/upload` (preview) | Body gains `csvTexts: string[]` alongside legacy `csvText` (or a versioned `{ files: { filename, csvText }[] }` shape — pick one, keep single-file shape working for rollback). Returns combined preview plus `perFile: { filename, rowCount }[]`. |
| `POST /api/transactions/import` | Body becomes `{ accountId, files: { filename, rows }[], profile? }`; creates one `ImportBatch` per file inside a `$transaction`; rows across files are deduped against DB hashes (existing logic) and rely on `skipDuplicates` for intra-batch collisions (existing behavior). Enqueue background jobs once per request. |

### C. Store reshape — `upload-store.ts`

```ts
interface UploadFile { filename: string; headers: string[]; csvText: string; source: 'csv' | 'pdf' }
interface UploadStore extends UploadState {
  files: UploadFile[]                 // replaces filename/csvHeaders/csvText
  signature: string | null            // session signature (from first file)
  profileHit: ImportProfile | null    // saved profile applied this session
  addFiles: (files: UploadFile[]) => { accepted: string[]; rejected: { filename: string; reason: string }[] }
  removeFile: (filename: string) => void
  // setStep / setAccountId / reset unchanged
}
```

`addFiles` enforces: all files' `headerSignature(f.headers)` === session signature
(set by first file); count cap 10; rejects carry human-readable reasons.

### D. Dropzone — `csv-dropzone.tsx`

- `multiple` on the input; iterate `e.dataTransfer.files`.
- Parse each file independently (CSV: Papa headers-only; PDF: `POST /api/upload/pdf`
  per file — parallel `Promise.all`, progress per file).
- Call `addFiles`; surface rejections as a dismissible error list in the dropzone.
- On first accepted file: `GET /api/import-profiles?signature=` → set `profileHit`.
- Reset stays a full-session clear.

### E. ColumnMapper changes

`column-mapper.tsx` needs decomposition anyway (660+ lines). Extract during this
work: `mapping-selects.tsx` (the per-field selects + confidence UI),
`account-rail.tsx` (account select + NewAccountForm), `preview-table.tsx`.

Behavior changes:

1. **Profile hit:** initialize `mapping` from `profileHit.mapping`, pre-select
   `profileHit.accountId`, render a banner: "Saved mapping for this format (used
   N times, last MMM D) — adjust anything before importing. [Re-detect columns]".
   **Skip both** the `guessMapping` effect and the `validate-mapping` fetch.
2. **Re-detect:** clears `profileHit` (session only) → existing
   guess-then-LLM flow runs as today.
3. **No profile:** unchanged flow; on successful import, the client includes
   `{ profile: { headers, mapping, source } }` in the import body (per §B) so the
   profile is saved.
4. **PDF sessions:** deterministic guess is already always right for the fixed
   headers; with a profile hit (or even without one) skip the LLM call when
   `source === 'pdf' && signature === pdfSignature` — saves a guaranteed-wasted
   call. Implement as: LLM call runs only when `!profileHit && source === 'csv'`.
5. Preview request sends all files' csvTexts; preview table shows an aggregated
   view with a per-file row-count strip ("jan.csv — 84 rows · feb.csv — 91 rows …").

### F. Upload page chrome — `upload-page-client.tsx`

- File-list chip row above the mapper when `files.length > 1`: name, row count
  (post-preview), remove button (disabled after import starts).
- Progress bar unchanged (upload → map & import); the done dialog already polls
  `/api/jobs/recent` — unchanged (jobs enqueued once per session).

### G. Decisions recorded

- **`InstitutionSchema` stays as-is.** It remains the account-creation template
  catalog. Do not route upload mappings through it; do not backfill its
  placeholder `csvMapping`s. (The two placeholder-write sites may be cleaned up
  opportunistically but are out of scope.)
- **Single account per session** — enforced by keeping `accountId` scalar in the
  store and the import route.
- **`ImportBatch` unchanged** — N files → N batches, one request.

## Edge cases

- Bank changes export format → new signature → new profile; old profile remains
  (harmless; self-pruning not needed at expected volumes).
- Same bank, two accounts with identical export format → one profile; `accountId`
  is just the last-used hint and is user-adjustable per session.
- Two files where one has a trailing empty header column → normalized signatures
  differ → rejected. Acceptable: user removes the odd file; message explains why.
- Overlapping statement periods across files → account-scoped `duplicateHash` +
  `skipDuplicates` dedupe (pre-existing behavior, including the pre-existing
  "identical legitimate transactions collapse" caveat).
- PDF failure mid-batch (one of three PDFs fails OCR) → reject that file, keep
  the others in the session.
- Import called with `files: []` → 400 via zod (min 1).
- Profile upsert must be fire-and-forget safe: unique `(userId, signature)` upsert,
  wrapped in try/catch after the import transaction commits.

## Testing plan

- `import-signature.test.ts`: normalization, order-independence, case/whitespace,
  known PDF fixed-header signature.
- Store tests (if store tests exist; otherwise extract `addFiles` logic to a pure
  `session-files.ts` and test): accept same-signature, reject mixed, cap at 10.
- API: import with 2 files → 2 `ImportBatch` rows, correct counts, one job
  enqueue; profile upsert created then incremented on second import; profile
  lookup by signature scoped to userId.
- Manual QA:
  1. Fresh CSV → map → import → re-upload same CSV → banner, prefilled, **no**
     `validate-mapping` network call.
  2. Adjust mapping on a repeat upload → profile updated on import.
  3. Drop 2 same-bank CSVs + 1 different-bank CSV → first two accepted, third
     rejected with reason.
  4. Drop 2 PDFs → both convert, single mapping step, import → 2 batches.
  5. Import overlapping months → duplicates skipped as before.

## Rollout

- `pnpm db:push` first (new model — P2022 risk otherwise; CI note per CLAUDE.md).
- Ship behind no flag; single-file flow is the degenerate case of multi-file, so
  regression risk concentrates in the store reshape — cover with the manual QA
  script. Keep `/api/upload` and `/api/transactions/import` single-file
  compatible for one release, then remove the legacy shape.

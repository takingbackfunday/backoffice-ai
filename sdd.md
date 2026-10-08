# SDD: Statement upload hardening (CSV / Excel / PDF)

Implements `prd.md`. Repo: `~/backoffice-ai` (Next.js 16, TypeScript, pnpm, Prisma 7, Vitest).

## 0. Rules for the implementer (read first)

1. Do the tasks **in order**. After EACH task run:
   ```bash
   npx vitest run
   npx tsc --noEmit
   ```
   Do not start the next task until both are green. (Exception: in Task 1, the excel test is expected to fail until step 1.3 is done.)
2. Change only the files listed in each task. Do not refactor anything else. Do not rename exports unless told to.
3. Do not change `prisma/schema.prisma`. Do not run `db:push`.
4. Do not `git commit` or `git push` unless the user asks.
5. Tests are pure-logic Vitest only (no jsdom, no React Testing Library). Do not add test libraries.
6. Follow the repo conventions in `CLAUDE.md`: imports via `@/`, no nested `<form>`, components ≤ 400 lines.
7. If a step's instructions don't match the code you see (line moved, name differs), find the equivalent code by
   searching for the quoted snippet. If you genuinely can't find it, STOP that step and report it. Don't improvise.
8. Keep a running note of anything skipped or ambiguous for the final report (Section 13).

Baseline check before starting (both must pass; record the test count):
```bash
npx vitest run && npx tsc --noEmit
```

---

## Task 1: Timezone-independent Excel dates (PRD R1)

### Why
`readWorkbook` uses `cellDates: true`, so SheetJS turns date serials into JS `Date`s in the **local timezone**. In the
browser of a US user the date then formats as the previous day. Fix: keep cells numeric (`cellDates: false`), keep
number formats (`cellNF: true`), and convert date-formatted serials with `XLSX.SSF.parse_date_code`, which is pure
arithmetic and timezone-independent. (This approach was prototyped and verified under UTC, Los Angeles and Auckland,
for `.xlsx` and `.xls`.)

### 1.1 `src/lib/excel.ts`

Replace `readWorkbook` with:
```ts
export function readWorkbook(data: ArrayBuffer | Uint8Array): Workbook {
  // cellDates: false keeps dates as Excel serial numbers (timezone-free);
  // cellNF: true keeps each cell's number format so we can tell which numbers are dates.
  return XLSX.read(data, { type: 'array', cellDates: false, cellNF: true })
}
```

Add this helper above `workbookSheetToCsv` (not exported):
```ts
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

/**
 * Convert an Excel date serial to "yyyy-mm-dd" using SheetJS's pure date-code
 * arithmetic — no JS Date, so the result is the same in every timezone.
 * Time-of-day is dropped (transactions are calendar dates).
 */
function serialToIsoDate(serial: number, date1904: boolean): string | null {
  const p = XLSX.SSF.parse_date_code(serial, { date1904 })
  if (!p || !p.y) return null
  return `${pad(p.y, 4)}-${pad(p.m, 2)}-${pad(p.d, 2)}`
}
```

Replace the body of `workbookSheetToCsv` with:
```ts
export function workbookSheetToCsv(wb: Workbook, sheetName: string): string {
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook.`)
  const date1904 = !!wb.Workbook?.WBProps?.date1904
  for (const address of Object.keys(ws)) {
    if (address.startsWith('!')) continue
    const cell = ws[address]
    if (!cell) continue
    const fmt = typeof cell.z === 'string' ? cell.z : undefined
    if (cell.t === 'n' && fmt && XLSX.SSF.is_date(fmt)) {
      const iso = serialToIsoDate(cell.v as number, date1904)
      if (iso) ws[address] = { t: 's', v: iso, w: iso }
    } else if (cell.t === 'd' && cell.v instanceof Date) {
      // Defensive: only reachable if a caller parsed with cellDates: true.
      const d = cell.v
      const iso = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`
      ws[address] = { t: 's', v: iso, w: iso }
    }
  }
  const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, rawNumbers: true })
  if (!csv.trim()) throw new Error(`Sheet "${sheetName}" is empty.`)
  return csv
}
```
Update the doc comment above it to: `Convert a single sheet to CSV text. Numbers are exported at full stored precision; date-formatted cells become yyyy-mm-dd (timezone-independent).`

If `tsc` complains about the `XLSX.SSF.parse_date_code` options argument type, use
`XLSX.SSF.parse_date_code(serial, { date1904 } as never)` and note it in the report.

### 1.2 `src/lib/excel.test.ts`

The two existing date tests build fixtures from JS `Date`s, which SheetJS writes using local time. That makes the
**fixture itself** timezone-dependent. Replace both tests (`'renders date cells as ISO dates, not serial numbers'` and
`'exports date cells as yyyy-mm-dd regardless of their display format'`) with serial-based fixtures.

Add at the top of the file (below `buildWorkbook`):
```ts
/** Excel 1900-system serial for a UTC calendar date. 2026-01-15 → 46037. */
function serialOf(y: number, m: number, d: number): number {
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function workbookWithCells(cells: Record<string, { v: number | string; z?: string }>, header: string[]): Uint8Array {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header, header.map(() => null)])
  for (const [addr, c] of Object.entries(cells)) {
    ws[addr] = typeof c.v === 'number' ? { t: 'n', v: c.v, ...(c.z ? { z: c.z } : {}) } : { t: 's', v: c.v }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
```

New tests (inside `describe('excelSheetToCsv')`):
1. `renders date cells as ISO dates, not serial numbers`: `workbookWithCells({ A2: { v: serialOf(2026,1,15), z: 'mm/dd/yyyy' }, B2: { v: 10 } }, ['Date','Amount'])` → CSV contains `2026-01-15` and does not match `/46\d{3}/`.
2. `exports date cells as yyyy-mm-dd regardless of display format`: same with `z: 'm/d/yy'` → contains `2026-01-15`.
3. `drops time-of-day from date-time cells`: `A2: { v: serialOf(2026,1,15) + 0.75, z: 'yyyy-mm-dd hh:mm' }` → contains `2026-01-15` and not `18:00`.
4. `reads dates from legacy .xls files`: build the same workbook as test 1 but write with `bookType: 'biff8'` (copy the body of `workbookWithCells` inline with that change) → contains `2026-01-15`.
5. `does not treat plain numbers as dates`: `A2: { v: 46037 }` (no `z`) with header `['Amount']` → CSV contains `46037`.

Keep all other existing tests unchanged (including `exports the stored numeric value instead of rounded display text`).

### 1.3 Timezone test script + CI
`package.json` → `scripts`, add after `"test:watch"`:
```json
"test:tz": "TZ=America/Los_Angeles vitest run src/lib/excel.test.ts src/lib/csv-processor.test.ts src/lib/csv-structure.test.ts src/lib/date-format.test.ts src/lib/dedup.test.ts && TZ=Pacific/Auckland vitest run src/lib/excel.test.ts src/lib/csv-processor.test.ts src/lib/csv-structure.test.ts src/lib/date-format.test.ts src/lib/dedup.test.ts",
```
`.github/workflows/ci.yml`: directly after the step `- name: Test` / `run: pnpm test`, add:
```yaml
      - name: Test ingestion in non-UTC timezones
        run: pnpm test:tz
```
(Don't add other test files to `test:tz`: `src/lib/rules/evaluate-condition.test.ts` has a known, out-of-scope timezone failure.)

**Acceptance:** `npx vitest run`, `pnpm test:tz` and `TZ=UTC npx vitest run src/lib/excel.test.ts` all pass.

---

## Task 2: Preview shows the stored calendar date (PRD R2)

File: `src/components/upload/preview-table.tsx`.

Replace `{new Date(row.date).toLocaleDateString()}` with
`{new Date(row.date).toLocaleDateString(undefined, { timeZone: 'UTC' })}`.

**Acceptance:** tsc green. (Manual check: `TZ=America/New_York node -e "console.log(new Date('2026-01-15T00:00:00.000Z').toLocaleDateString(undefined,{timeZone:'UTC'}))"` prints `1/15/2026`.)

---

## Task 3: Repeat transactions get distinct hashes (PRD R3, R9 linear preview)

### 3.1 `src/lib/dedup.ts`
Add an optional `occurrence?: number` to the params type. Build the normalized array as today, then **only if**
`params.occurrence && params.occurrence > 0` push `` `#${params.occurrence}` `` before `join('|')`. Update the doc
comment: "occurrence (0-based) distinguishes genuine repeats of the same transaction within one file; occurrence 0
produces the same hash as before, for backward compatibility."

Tests, appended to `src/lib/dedup.test.ts`:
- `occurrence 0 and omitted give identical hashes`
- `occurrence 1 differs from occurrence 0`
- `pinned legacy hash is unchanged`: compute `buildDuplicateHash(params)` (the `params` const already in the file) once, hardcode the hex string the test prints as the expected value, and assert equality. (To get it: temporarily `console.log` it, run, paste, remove the log.) This guards backward compatibility.

### 3.2 `src/lib/csv-processor.ts`
1. In `interface NormalizedRow` add `occurrence: number` (after `duplicateHash`), with the comment `/** 0-based index among identical rows (same account/date/amount/description) within this file. */`.
2. In `tryRow`'s returned row object, add `occurrence: 0,` after `duplicateHash: …`.
3. Above the main `for` loop (`for (let i = 0; i < structure.rows.length; i++)`), add:
   ```ts
   // Genuine repeats (two identical fares on one day) must not collapse into one
   // transaction. The base hash (occurrence 0) is the grouping key.
   const occurrenceCounts = new Map<string, number>()
   ```
4. Replace `if (result.ok) rows.push(result.row)` with:
   ```ts
   if (result.ok) {
     const baseHash = result.row.duplicateHash
     const occurrence = occurrenceCounts.get(baseHash) ?? 0
     occurrenceCounts.set(baseHash, occurrence + 1)
     if (occurrence > 0) {
       result.row.occurrence = occurrence
       result.row.duplicateHash = buildDuplicateHash({
         accountId,
         date: result.row.date,
         amount: result.row.amount,
         description: result.row.description,
         occurrence,
       })
     }
     rows.push(result.row)
   }
   ```
   Keep the `else { … }` branch exactly as it is.

Tests, appended to `src/lib/csv-processor.test.ts` (follow the style of the existing tests; use an explicit mapping
`{ dateCol: 'Date', amountCol: 'Amount', descCol: 'Description', amountSign: 'normal' }`):
- CSV `Date,Description,Amount\n2026-01-05,Metro fare,-2.75\n2026-01-05,Metro fare,-2.75\n2026-01-06,Metro fare,-2.75` →
  3 rows; occurrences `[0, 1, 0]`; all three hashes distinct; `rows[0].duplicateHash === buildDuplicateHash({ accountId, date: rows[0].date, amount: -2.75, description: 'Metro fare' })`.
- Processing the same CSV twice gives identical hash arrays (determinism).

### 3.3 Session-level duplicates: new file `src/lib/session-dedup.ts`
```ts
/**
 * Flags rows whose hash already appeared earlier in the same upload session
 * (e.g. two overlapping statement exports). The first occurrence is not a
 * duplicate; later ones are.
 */
export function markSessionDuplicates(hashes: string[]): boolean[] {
  const seen = new Set<string>()
  return hashes.map((h) => {
    if (seen.has(h)) return true
    seen.add(h)
    return false
  })
}
```
New test file `src/lib/session-dedup.test.ts`: `['a','b','a','c','b']` → `[false,false,true,false,true]`; `[]` → `[]`.

### 3.4 `src/types/index.ts`
In `interface PreviewRow` add `occurrence?: number` after `duplicateHash`.

### 3.5 `src/app/api/upload/route.ts`
1. Import `markSessionDuplicates` from `@/lib/session-dedup`.
2. After `const existingHashes = new Set(...)`, add:
   `const sessionDuplicate = markSessionDuplicates(allRows.map((r) => r.duplicateHash))`
3. Replace the `categorized.map((row) => { … })` callback signature with `(row, i) => {` and inside it:
   - replace `const originalRow = allRows.find((r) => r.duplicateHash === row.duplicateHash)` with
     `const originalRow = allRows[i] // categorizeRows preserves order`
   - change `isDuplicate: existingHashes.has(row.duplicateHash),` to
     `isDuplicate: existingHashes.has(row.duplicateHash) || sessionDuplicate[i],`
   - add `occurrence: originalRow.occurrence,` after `duplicateHash`
   - the `originalRow?.` optional chains may stay or become `originalRow.`; either is fine.

### 3.6 `src/components/upload/column-mapper.tsx`
In `handleImport`, in the per-row object sent to the import API, add `occurrence: r.occurrence ?? 0,` after
`duplicateHash: r.duplicateHash,`.

**Acceptance:** all tests green including the new ones; tsc green.

---

## Task 4: Trustworthy, atomic import API (PRD R4)

### 4.1 New pure module `src/lib/import-rows.ts`
```ts
import { buildDuplicateHash } from './dedup'

export interface ImportRowInput {
  date: string
  amount: number
  description: string
  notes?: string | null
  category?: string | null
  categoryId?: string | null
  payeeId?: string | null
  duplicateHash: string
  occurrence?: number
  rawData: Record<string, string>
}

export class ImportHashMismatchError extends Error {
  constructor() {
    super('Import data is out of date — please refresh the preview.')
    this.name = 'ImportHashMismatchError'
  }
}

/** Recompute every row's hash server-side; throws if any client hash differs. */
export function verifyRowHashes(accountId: string, rows: ImportRowInput[]): void {
  for (const r of rows) {
    const expected = buildDuplicateHash({
      accountId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      occurrence: r.occurrence ?? 0,
    })
    if (expected !== r.duplicateHash) throw new ImportHashMismatchError()
  }
}

/**
 * Null out category/payee ids the user does not own so an import can never
 * link to another tenant's records. Returns the cleaned rows and how many refs were dropped.
 */
export function scrubForeignRefs<T extends ImportRowInput>(
  rows: T[],
  owned: { categoryIds: Set<string>; payeeIds: Set<string> }
): { rows: T[]; scrubbed: number } {
  let scrubbed = 0
  const cleaned = rows.map((r) => {
    let categoryId = r.categoryId ?? null
    let payeeId = r.payeeId ?? null
    if (categoryId && !owned.categoryIds.has(categoryId)) { categoryId = null; scrubbed++ }
    if (payeeId && !owned.payeeIds.has(payeeId)) { payeeId = null; scrubbed++ }
    return { ...r, categoryId, payeeId }
  })
  return { rows: cleaned, scrubbed }
}
```
New test file `src/lib/import-rows.test.ts`:
- `verifyRowHashes` passes for a row whose hash was built with `buildDuplicateHash` (with occurrence 0, and separately occurrence 2).
- It throws `ImportHashMismatchError` when the amount is changed after hashing.
- `scrubForeignRefs` keeps owned ids, nulls foreign ones, leaves `null` alone, and returns the right `scrubbed` count.

### 4.2 Rewrite `src/app/api/transactions/import/route.ts`
Keep the imports, `nullableString`, `optionalNullableString`, `ImportFileSchema`, `ProfileSchema` and
`ImportBodySchema` shapes. Make these changes:

1. Add imports: `import { verifyRowHashes, scrubForeignRefs, ImportHashMismatchError } from '@/lib/import-rows'`.
2. Add `const MAX_ABS_AMOUNT = 10_000_000_000 // Decimal(12,2) limit` and change `ImportRowSchema` fields:
   - `date: z.string().datetime({ offset: true }),`
   - `amount: z.number().finite().refine((n) => Math.abs(n) < MAX_ABS_AMOUNT, { message: 'Amount out of range' }),`
   - add `occurrence: z.number().int().min(0).optional(),` after `duplicateHash`.
3. After the account ownership check (`if (!account) return notFound(...)`), add:
   ```ts
   // Server is the authority: hashes must match the row data
   try {
     for (const f of files) verifyRowHashes(accountId, f.rows)
   } catch (err) {
     if (err instanceof ImportHashMismatchError) return badRequest(err.message)
     throw err
   }

   // Only allow links to this user's own categories/payees
   const refCategoryIds = [...new Set(files.flatMap((f) => f.rows.map((r) => r.categoryId).filter((v): v is string => !!v)))]
   const refPayeeIds = [...new Set(files.flatMap((f) => f.rows.map((r) => r.payeeId).filter((v): v is string => !!v)))]
   const [ownedCats, ownedPayees] = await Promise.all([
     refCategoryIds.length ? prisma.category.findMany({ where: { userId, id: { in: refCategoryIds } }, select: { id: true } }) : [],
     refPayeeIds.length ? prisma.payee.findMany({ where: { userId, id: { in: refPayeeIds } }, select: { id: true } }) : [],
   ])
   const owned = { categoryIds: new Set(ownedCats.map((c) => c.id)), payeeIds: new Set(ownedPayees.map((p) => p.id)) }
   let scrubbedTotal = 0
   const cleanFiles = files.map((f) => {
     const { rows, scrubbed } = scrubForeignRefs(f.rows, owned)
     scrubbedTotal += scrubbed
     return { ...f, rows }
   })
   if (scrubbedTotal > 0) logger.warn('import', 'dropped foreign category/payee refs', { userId, scrubbedTotal })
   ```
   From here on use `cleanFiles` instead of `files` (including for `allHashes`).
4. Replace everything from `let totalImported = 0` up to (and including) the
   `if (totalImported > 0) { await prisma.account.update(...) }` block with one interactive transaction:
   ```ts
   const { totalImported, totalSkipped, batchIds, allImportedIds } = await prisma.$transaction(
     async (tx) => {
       let totalImported = 0
       let totalSkipped = 0
       const batchIds: string[] = []
       const allImportedIds: string[] = []

       for (const file of cleanFiles) {
         const newRows = file.rows.filter((r) => !existingHashes.has(r.duplicateHash))
         if (newRows.length === 0) {
           totalSkipped += file.rows.length
           continue
         }

         const importBatch = await tx.importBatch.create({
           data: { accountId, filename: file.filename, rowCount: 0, skippedCount: 0 },
         })

         const { count } = await tx.transaction.createMany({
           data: newRows.map((row) => ({
             accountId,
             importBatchId: importBatch.id,
             date: new Date(row.date),
             amount: row.amount,
             description: row.description,
             notes: row.notes ?? null,
             category: row.category ?? null,
             categoryId: row.categoryId ?? null,
             payeeId: row.payeeId ?? null,
             duplicateHash: row.duplicateHash,
             rawData: row.rawData,
             tags: [],
           })),
           skipDuplicates: true,
         })

         if (count === 0) {
           await tx.importBatch.delete({ where: { id: importBatch.id } })
           totalSkipped += file.rows.length
           continue
         }

         await tx.importBatch.update({
           where: { id: importBatch.id },
           data: { rowCount: count, skippedCount: file.rows.length - count },
         })

         const importedTxs = await tx.transaction.findMany({
           where: { importBatchId: importBatch.id },
           select: { id: true },
         })
         allImportedIds.push(...importedTxs.map((t) => t.id))
         totalImported += count
         totalSkipped += file.rows.length - count
         batchIds.push(importBatch.id)
       }

       if (totalImported > 0) {
         await tx.account.update({ where: { id: accountId }, data: { lastImportAt: new Date() } })
       }

       return { totalImported, totalSkipped, batchIds, allImportedIds }
     },
     { maxWait: 10_000, timeout: 60_000 }
   )
   ```
   The profile upsert and background-job enqueue blocks that follow stay **unchanged** and stay **outside** the transaction.
5. Replace the final `} catch {` / `return serverError('Failed to import transactions')` with:
   ```ts
   } catch (err) {
     logger.error('import', 'POST error', { message: err instanceof Error ? err.message : String(err) })
     return serverError('Failed to import transactions')
   }
   ```

**Acceptance:** tsc green, tests green. Re-read the file once and confirm `files` is no longer used after `cleanFiles`
is defined (except in building `cleanFiles` itself).

---

## Task 5: Honest completion dialog (PRD R5)

1. `src/types/index.ts`, `interface UploadState`: add
   `lastImport: { imported: number; skipped: number } | null`
   `profileStatus: 'idle' | 'loading' | 'done'` (used in Task 6; add it now).
2. `src/stores/upload-store.ts`:
   - `initialState`: add `lastImport: null, profileStatus: 'idle',`.
   - Interface `UploadStore`: add `setLastImport: (r: { imported: number; skipped: number } | null) => void` and
     `setProfileStatus: (s: UploadState['profileStatus']) => void`.
   - Implementations: `setLastImport: (lastImport) => set({ lastImport }),` and `setProfileStatus: (profileStatus) => set({ profileStatus }),`.
3. `src/components/upload/column-mapper.tsx`: add `setLastImport` to the `useUploadStore()` destructure. In
   `handleImport`, replace `setStep('done')` with:
   ```ts
   setLastImport({ imported: json.data?.imported ?? 0, skipped: json.data?.skipped ?? 0 })
   setStep('done')
   ```
4. `src/components/upload/upload-page-client.tsx`:
   - `const lastImport = useUploadStore((s) => s.lastImport)`
   - Replace the `<DialogTitle>` and `<DialogDescription>` contents:
     ```tsx
     <DialogTitle>{lastImport && lastImport.imported === 0 ? 'Nothing new to import' : 'Import complete!'}</DialogTitle>
     <DialogDescription>
       {lastImport
         ? `Imported ${lastImport.imported} transaction${lastImport.imported === 1 ? '' : 's'}` +
           (lastImport.skipped > 0 ? ` · ${lastImport.skipped} skipped as duplicates` : '') + '.'
         : 'Your transactions have been imported.'}
     </DialogDescription>
     ```

**Acceptance:** tsc green.

---

## Task 6: Safe AI mapping assist (PRD R6)

### 6.1 `src/lib/llm/openrouter.ts`: optional timeout on `openrouterChat`
Change the signature to add a 4th optional parameter `timeoutMs?: number`. Implementation:
- Before `fetch`: `const controller = timeoutMs ? new AbortController() : null` and
  `const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null`.
- Pass `signal: controller?.signal` to `fetch`.
- Wrap the fetch in try/catch: if the error's `name === 'AbortError'` throw
  `new Error(\`OpenRouter timed out after ${Math.round(timeoutMs! / 1000)}s\`)`, otherwise rethrow.
- Clear the timer in a `finally` after the response body has been read (i.e. wrap from `fetch` through `res.json()`).
- Callers that don't pass `timeoutMs` must behave exactly as before. Do not modify any other function in this file.

### 6.2 `src/app/api/llm/validate-mapping/route.ts`
1. Import `badRequest` from `@/lib/api-response`.
2. Invalid request body: `return badRequest('Invalid request body')` (instead of `serverError`).
3. Pass `30_000` as the timeout: `openrouterChat([...], 'mistralai/mistral-small-2603', 4096, 30_000)`.
4. Validate the LLM output. Add above `POST`:
   ```ts
   const ColResultSchema = z.object({
     col: z.string().nullable(),
     confidence: z.number(),
     reason: z.string().optional().default(''),
   })
   const ValidationResultSchema = z.object({
     dateCol: ColResultSchema,
     amountCol: ColResultSchema,
     descCol: ColResultSchema,
     notesCol: ColResultSchema,
     amountSign: z
       .object({ value: z.enum(['normal', 'inverted']), confidence: z.number(), reason: z.string().optional().default('') })
       .optional(),
   })
   ```
   Replace `return ok(result)` with:
   ```ts
   const validated = ValidationResultSchema.safeParse(result)
   if (!validated.success) {
     logger.error('llm-validate-mapping', 'invalid LLM output shape', { issues: validated.error.issues.length })
     return serverError('AI validation returned an unexpected format')
   }
   return ok(validated.data)
   ```

### 6.3 `src/components/upload/csv-dropzone.tsx`: profile lookup status
Add `const setProfileStatus = useUploadStore((s) => s.setProfileStatus)`. In `ingest`, change the body after the
`parsed.length === 0` early return to:
```ts
const wasFirstUpload = useUploadStore.getState().files.length === 0
if (wasFirstUpload) setProfileStatus('loading')
const result = addFiles(parsed)

const allErrors = [...parseErrors, ...result.rejected]
if (allErrors.length > 0) setErrors(allErrors)

if (!wasFirstUpload) return
if (result.accepted.length === 0) {
  setProfileStatus('idle')
  return
}
// Profile lookup on first upload of the session
const sig = headerSignature(result.accepted[0].headers)
try {
  const res = await fetch(`/api/import-profiles?signature=${sig}`)
  if (res.ok) {
    const json = await res.json()
    if (json.data) setProfileHit(json.data)
  }
} catch {
  // Non-critical — continue without profile
} finally {
  setProfileStatus('done')
}
```
Add `setProfileStatus` to the `useCallback` dependency array.

### 6.4 `src/components/upload/column-mapper.tsx`
1. Add `profileStatus` to the `useUploadStore()` destructure.
2. Track user-touched fields: `const touchedRef = useRef<Set<string>>(new Set())`.
   Change the `set` helper to:
   ```ts
   const set = (field: keyof CsvMapping) => (v: string | undefined) => {
     touchedRef.current.add(field)
     setMapping((m) => ({ ...m, [field]: v }))
   }
   ```
   In the amount-sign `<select>` `onChange`, add `touchedRef.current.add('amountSign')` before `setMapping`.
3. LLM validation effect (`// ── LLM validation: only for non-profile CSV sessions ──`):
   - The first guard line becomes:
     `if (!csvHeaders.length || !files.length || profileHit || profileStatus !== 'done') return`
   - Inside `setMapping((m) => { … })` replace the loop and the `amountSign` line with:
     ```ts
     for (const field of ['dateCol', 'amountCol', 'descCol', 'notesCol'] as const) {
       const v = j.data?.[field]
       if (v?.confidence >= 99 && v.col && csvHeaders.includes(v.col) && !touchedRef.current.has(field)) {
         next[field] = v.col
       }
     }
     // amountSign is never auto-applied — see the sign suggestion notice.
     ```
   - Add `profileStatus` to the dependency array: `[csvHeaders.join(','), files[0]?.csvText, profileHit, profileStatus]`.
4. Sign suggestion notice. Add state `const [signSuggestionDismissed, setSignSuggestionDismissed] = useState(false)`
   and derive (in the component body, not in an effect):
   ```ts
   const suggestedSign = validation?.amountSign
   const showSignSuggestion =
     !signSuggestionDismissed &&
     !!suggestedSign &&
     suggestedSign.confidence >= 90 &&
     (suggestedSign.value === 'normal' || suggestedSign.value === 'inverted') &&
     suggestedSign.value !== (mapping.amountSign ?? 'normal')
   ```
   Render directly below the amount-sign `<div>` (the one containing `select-amountSign`):
   ```tsx
   {showSignSuggestion && suggestedSign && (
     <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1.5" data-testid="sign-suggestion">
       <p className="text-xs text-amber-900">
         AI thinks {suggestedSign.value === 'inverted' ? 'expenses are positive' : 'expenses are negative'} in this file ({suggestedSign.confidence}%).
       </p>
       <div className="flex gap-2">
         <button type="button" className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white"
           onClick={() => { touchedRef.current.add('amountSign'); setMapping((m) => ({ ...m, amountSign: suggestedSign.value as 'normal' | 'inverted' })) }}>
           Switch
         </button>
         <button type="button" className="text-xs text-amber-900 hover:underline" onClick={() => setSignSuggestionDismissed(true)}>
           Keep current
         </button>
       </div>
     </div>
   )}
   ```

**Acceptance:** tsc green, `npx eslint src/components/upload src/app/api/llm` has no new errors.

---

## Task 7: Dropzone stays mounted; processing lock (PRD R7)

### 7.1 `src/components/upload/csv-dropzone.tsx`
1. Signature: `export function CsvDropzone({ compact = false }: { compact?: boolean } = {})`.
2. Replace `const [processing, setProcessing] = useState(false)` with
   `const [processing, setProcessing] = useState<'pdf' | 'excel' | 'file' | null>(null)` and add
   `const busyRef = useRef(false)` (add `useRef` to the React import).
3. In `parsePdf`, as the first line: `if (file.size > 10 * 1024 * 1024) throw new Error('PDF too large (max 10 MB).')`.
4. In `handleFiles`, replace from `setErrors([])` through `setProcessing(false)` so that:
   ```ts
   if (busyRef.current) return
   busyRef.current = true
   setErrors([])
   const names = allFiles.map((f) => f.name.toLowerCase())
   setProcessing(
     names.some((n) => n.endsWith('.pdf')) ? 'pdf'
     : names.some((n) => n.endsWith('.xlsx') || n.endsWith('.xls')) ? 'excel'
     : 'file'
   )
   try {
     // … existing body from `const newPicks` through `await ingest(parsed, parseErrors)` (unchanged)
   } finally {
     busyRef.current = false
     setProcessing(null)
   }
   ```
   i.e. move the existing `setProcessing(false)` line out (delete it) and wrap the rest of the body in the try/finally.
   The early `if (allFiles.length === 0) return` stays before the busy check.
5. Rendering:
   - `processing ? 'cursor-wait opacity-80' : 'cursor-pointer'` stays (null is falsy).
   - The input: `disabled={processing !== null}`.
   - Text block: when `processing === 'pdf'`, show the existing PDF copy; when `processing === 'excel'`, show
     `<p className="font-medium text-sm animate-pulse">Reading workbook…</p>`; when `'file'`, show
     `<p className="font-medium text-sm animate-pulse">Reading file…</p>`; when null, show the idle copy.
   - Compact mode: when `compact` is true, the label uses `p-4` instead of `p-12`, hides the big emoji span, and the
     idle copy is a single line `<p className="text-sm">Add more files with the same columns — drop or click</p>`.
     The outer wrapper `<div className="max-w-lg">` stays.
   - Add `focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2` to the label's className (PRD R10).

### 7.2 `src/components/upload/upload-page-client.tsx`
Replace `{step === 'upload' && <CsvDropzone />}` with:
```tsx
{step !== 'done' && (
  <div className={step === 'upload' ? '' : 'mb-4'}>
    <CsvDropzone compact={step !== 'upload'} />
  </div>
)}
```
This keeps the same component instance mounted from `upload` → `map-columns`, so errors and sheet pickers survive.
Do not move it after the mapping block (React would remount it).

In the multi-file chip list, change `✕` to `<span aria-hidden="true">✕</span>` (the button already has an `aria-label`).

**Acceptance:** tsc green; eslint has no new errors.

---

## Task 8: Bounded PDF extraction (PRD R8)

### 8.1 New pure helper `src/lib/ocr/pdf-data-uri.ts`
```ts
/**
 * Decode a base64 data URI and confirm the bytes are a PDF (magic "%PDF-").
 * Accepts any declared MIME type (some OSes report application/octet-stream).
 * Returns the buffer plus a normalised application/pdf data URI, or null.
 */
export function decodePdfDataUri(uri: string): { buffer: Buffer; dataUri: string } | null {
  const m = uri.match(/^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return null
  const buffer = Buffer.from(m[1], 'base64')
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return null
  return { buffer, dataUri: `data:application/pdf;base64,${m[1]}` }
}
```
Test file `src/lib/ocr/pdf-data-uri.test.ts`:
- `data:application/pdf;base64,` + base64 of `'%PDF-1.7 test'` → non-null, `dataUri` starts with `data:application/pdf;base64,`.
- Same payload with `data:application/octet-stream;base64,` → non-null.
- base64 of `'hello world'` → null.
- `'not a data uri'` → null.

### 8.2 `src/lib/ocr/mistral.ts`: timeout for `mistralOcrPdf` only
Add `const OCR_TIMEOUT_MS = 90_000`. In `mistralOcrPdf`, create an `AbortController`, `setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)`,
pass `signal`, and on `AbortError` throw `new Error('Mistral OCR timed out after 90s')`. Clear the timer in `finally`
after the JSON is read. Leave `mistralOcr` (the image function, used by receipts) unchanged.

### 8.3 `src/lib/ocr/extract-statement.ts`
Add `export const STATEMENT_MODEL = 'anthropic/claude-sonnet-4.6'`. In `extractStatementRows`, use
`STATEMENT_MODEL` and pass `120_000` as the 4th argument to `openrouterChat`.

### 8.4 `src/app/api/upload/pdf/route.ts`
1. Imports: `NextResponse` from `next/server`; `checkDailyBudget, recordAgentUsage` from `@/lib/agent/usage`;
   `decodePdfDataUri` from `@/lib/ocr/pdf-data-uri`; `STATEMENT_MODEL` from `@/lib/ocr/extract-statement`.
2. Right after the `userId` check:
   ```ts
   const budget = await checkDailyBudget(userId)
   if (!budget.ok) {
     return NextResponse.json(
       { data: null, error: 'Daily AI usage limit reached — try again tomorrow, or upload a CSV export instead.' },
       { status: 429 }
     )
   }
   ```
3. Replace the data-URI regex block and the `Buffer.from` line with:
   ```ts
   const decoded = decodePdfDataUri(pdf)
   if (!decoded) return badRequest('This file is not a valid PDF.')
   const pdfBuffer = decoded.buffer
   ```
   Keep the size check. Change `mistralOcrPdf(pdf)` to `mistralOcrPdf(decoded.dataUri)`.
4. Add `const t0 = Date.now()` before the OCR call. After building `csvText` and before `return ok(...)`:
   ```ts
   // Estimated (chars/4) — openrouterChat does not return usage.
   await recordAgentUsage({
     userId,
     endpoint: 'upload-pdf',
     model: STATEMENT_MODEL,
     inputTokens: Math.ceil(ocr.markdown.length / 4),
     outputTokens: Math.ceil(csvText.length / 4),
     toolRounds: 0,
     durationMs: Date.now() - t0,
   })
   ```

**Acceptance:** tests green (including the new ones), tsc green.

---

## Task 9: Preview caption and accessibility (PRD R9, R10)

1. `src/components/upload/preview-table.tsx`: inside the outer `<div className="overflow-auto …">`, after `</table>`, add:
   ```tsx
   {rows.length > 100 && (
     <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="preview-truncated">
       Showing first 100 of {rows.length} rows
     </p>
   )}
   ```
2. `src/components/upload/upload-page-client.tsx`: on the step `<span key={s} …>` in the progress `<nav>`, add
   `aria-current={displayStep === s ? 'step' : undefined}`.
3. `src/components/upload/column-mapper.tsx`:
   - On the status row `<div className="flex items-center gap-4 text-xs min-h-5 flex-wrap">`, add `aria-live="polite"`.
   - Import button: `aria-label={importing ? 'Importing…' : \`Import ${newCount} new transactions\`}`.
   - In the multi-file list, change `✕` to `<span aria-hidden="true">✕</span>` and add
     `aria-label={\`Remove ${f.filename}\`}` to that button.
4. Reduced motion is handled in Task 10 when the keyframes move to `globals.css`.

**Acceptance:** tsc green.

---

## Task 10: Split `column-mapper.tsx` to ≤ 400 lines (PRD R11, no behaviour change)

1. **Move CSS.** Delete the whole `<style>{`…`}</style>` element from `column-mapper.tsx` (and the now-redundant
   fragment wrapper `<>…</>` if only one child remains). Append its CSS verbatim to the end of `src/app/globals.css`, followed by:
   ```css
   @media (prefers-reduced-motion: reduce) {
     .account-throb, .col-throb, .ai-changed { animation: none; }
   }
   ```
   Check that `account-throb` is still applied somewhere (`grep -rn "account-throb" src`) so the CSS isn't dead. If it isn't, keep it anyway.
2. **Date-ambiguity prompt.** Create `src/components/upload/date-ambiguity-prompt.tsx` exporting
   `DateAmbiguityPrompt({ ambiguity, onChoose }: { ambiguity: { chosen: string; alternatives: string[]; exampleRaw: string }; onChoose: (fmt: string) => void })`.
   Move the JSX inside `{dateAmbiguity && ( … )}` into it verbatim (it uses `renderDateExample` from `@/lib/date-format`). Each button's `onClick` becomes `() => onChoose(fmt)`.
   In the mapper:
   ```tsx
   {dateAmbiguity && (
     <DateAmbiguityPrompt ambiguity={dateAmbiguity} onChoose={(fmt) => {
       setMapping((m) => ({ ...m, dateFormat: fmt }))
       setDateAmbiguity((a) => (a ? { ...a, chosen: fmt } : a))
     }} />
   )}
   ```
   Keep the `data-testid` attributes unchanged.
3. **Reconciliation notices.** Create `src/components/upload/reconciliation-notices.tsx` exporting the
   `ReconciliationMeta` interface (moved from the mapper) and `ReconciliationNotices({ items }: { items: ReconciliationMeta[] })`,
   which renders the `reconciliations.map(...)` JSX verbatim (wrap it in a fragment). The mapper renders
   `{!previewLoading && <ReconciliationNotices items={reconciliations} />}` and imports the type from the new file.
4. **LLM validation hook.** Create `src/components/upload/hooks/use-mapping-validation.ts`:
   ```ts
   export function useMappingValidation(args: {
     csvHeaders: string[]
     files: UploadFile[]
     source: UploadFile['source']
     profileHit: ImportProfile | null
     profileStatus: 'idle' | 'loading' | 'done'
     mapping: Partial<CsvMapping>
     setMapping: React.Dispatch<React.SetStateAction<Partial<CsvMapping>>>
     touchedRef: React.MutableRefObject<Set<string>>
   }): { validation: MappingValidation | null; validating: boolean }
   ```
   Move the `validation`/`validating` `useState`s and the entire LLM validation `useEffect` (as modified in Task 6)
   into it verbatim, keeping its dependency array and the `eslint-disable-next-line` comment. Replace them in the
   mapper with `const { validation, validating } = useMappingValidation({ … })`. The `touchedRef` declaration stays in the mapper.
5. Remove the unused `eslint-disable-next-line` directive that eslint reports on the date-detection effect (the warning
   at "Unused eslint-disable directive"), only if eslint still reports it as unused after your changes.
6. Check: `wc -l src/components/upload/column-mapper.tsx` ≤ 400. If it's still over, also extract the profile-hit
   banner into `profile-hit-banner.tsx` the same way. Do not extract anything else.

**Acceptance:** line count ≤ 400; tsc, tests and eslint (no new errors) green.

---

## 11. Out of scope (do NOT change)
- `prisma/schema.prisma`, any migration, `db:push`.
- `src/app/api/bank-agent/*` (they automatically benefit from Task 3; don't edit them).
- `src/app/api/transactions/route.ts` (manual-entry hash; leave it).
- `src/lib/amount.ts`, `src/lib/date-format.ts`, `src/lib/csv-structure.ts`, `MAX_ERRORS`.
- `src/lib/rules/evaluate-condition.test.ts` timezone failure.
- `mistralOcr` (image OCR used by receipts), and every function in `openrouter.ts` other than `openrouterChat`.
- PDF chunking, PDF totals reconciliation, Decimal migration, new file formats.

## 12. Final checklist
1. `npx vitest run`: all green.
2. `pnpm test:tz`: all green.
3. `npx tsc --noEmit`: no errors.
4. `npx eslint src`: no new errors compared to baseline.
5. `wc -l src/components/upload/*.tsx`: every file ≤ 400.
6. `git status`: only these paths are modified or added:
   `package.json`, `.github/workflows/ci.yml`, `src/app/globals.css`,
   `src/lib/excel.ts`, `src/lib/excel.test.ts`, `src/lib/dedup.ts`, `src/lib/dedup.test.ts`,
   `src/lib/csv-processor.ts`, `src/lib/csv-processor.test.ts`, `src/lib/session-dedup.ts`, `src/lib/session-dedup.test.ts`,
   `src/lib/import-rows.ts`, `src/lib/import-rows.test.ts`, `src/lib/llm/openrouter.ts`,
   `src/lib/ocr/mistral.ts`, `src/lib/ocr/extract-statement.ts`, `src/lib/ocr/pdf-data-uri.ts`, `src/lib/ocr/pdf-data-uri.test.ts`,
   `src/types/index.ts`, `src/stores/upload-store.ts`,
   `src/app/api/upload/route.ts`, `src/app/api/upload/pdf/route.ts`, `src/app/api/transactions/import/route.ts`,
   `src/app/api/llm/validate-mapping/route.ts`,
   `src/components/upload/csv-dropzone.tsx`, `src/components/upload/column-mapper.tsx`,
   `src/components/upload/upload-page-client.tsx`, `src/components/upload/preview-table.tsx`,
   `src/components/upload/date-ambiguity-prompt.tsx`, `src/components/upload/reconciliation-notices.tsx`,
   `src/components/upload/hooks/use-mapping-validation.ts`, optionally `src/components/upload/profile-hit-banner.tsx`,
   plus `prd.md`, `sdd.md`.

## 13. Report back
For each task: **done / partially done / skipped**, with the reason. List:
- any test whose expectation you changed, and why;
- any place where the code didn't match this spec and what you did;
- the pinned legacy hash value used in Task 3.1;
- final test count vs. the baseline count.

## 14. Manual QA script (for the human reviewer, after implementation)
1. Run with the machine set to a US timezone. Upload an `.xlsx` with a date cell `01/15/2026`: the preview shows Jan 15 and the stored transaction is 2026-01-15.
2. Upload a CSV with two identical rows: the preview says "2 new"; import → the dialog says "Imported 2 transactions"; re-upload → "0 new / 2 duplicates", and the dialog says "Nothing new to import".
3. Drop `a.csv` together with a multi-sheet `.xlsx`: the mapping screen shows, and the sheet picker is still visible above it.
4. Drop a 12 MB PDF: it's rejected instantly in the browser.
5. Change the date column, then wait for "Checking with AI…" to finish: your choice is not overwritten.
6. Tab to the dropzone: a focus ring is visible.

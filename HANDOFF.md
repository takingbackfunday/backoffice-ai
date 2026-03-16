# Backoffice AI — Session Handoff
_Last updated: 2026-03-14_

---

## What this app is

A lightweight financial management tool for freelancers, consultants, and small property managers.
Users import CSVs from multiple bank accounts and tag transactions against **Projects** (clients, properties, jobs).
Multi-user (US / UK / DE). V1 focus: CSV import + normalization + project tagging.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14, App Router, TypeScript, `src/` dir |
| Auth | Clerk |
| Database | PostgreSQL on Neon |
| ORM | Prisma |
| Styling | Tailwind CSS + shadcn/ui |
| CSV parsing | Papa Parse |
| State | Zustand |
| Validation | Zod + React Hook Form |
| Package manager | pnpm |

---

## Key files

```
prisma/
  schema.prisma          — full data model (see below)
  seed.ts                — seeds 9 institution schemas (US/UK/DE)

src/
  middleware.ts          — Clerk auth guard (all routes except /sign-in, /sign-up)
  types/index.ts         — shared TS types incl. TransactionWithRelations, CsvMapping
  lib/
    prisma.ts            — singleton Prisma client
    csv-processor.ts     — PapaParse → normalized PreviewRow[]
    dedup.ts             — SHA-256 duplicate hash
    api-response.ts      — ok() / created() / badRequest() / notFound() / serverError()

  app/api/
    transactions/route.ts          — GET (paginated, sorted, filtered)
    transactions/[id]/route.ts     — PATCH + DELETE single transaction
    transactions/import/route.ts   — POST: commit import batch
    upload/route.ts                — POST: parse CSV → preview rows
    accounts/route.ts              — GET / POST accounts
    projects/route.ts              — GET / POST projects
    institutions/route.ts          — GET / POST institution schemas

  components/
    transactions/transaction-table.tsx   — full Excel-like table (see below)
    upload/
      csv-dropzone.tsx        — drag & drop file intake
      column-mapper.tsx       — map CSV headers → schema fields (auto-mapper + manual)
      import-preview.tsx      — preview before commit
    layout/sidebar.tsx, header.tsx
    projects/project-select.tsx
```

---

## Data model (summary)

```
InstitutionSchema   — global bank CSV schemas (seeded)
Account             — belongs to a Clerk userId, linked to an InstitutionSchema
Project             — CLIENT | PROPERTY | JOB | OTHER, belongs to userId
Transaction         — belongs to Account, optionally linked to Project + ImportBatch
ImportBatch         — groups transactions from one CSV upload
```

---

## What was built today

### 1. Excel-like TransactionTable (`transaction-table.tsx`)
- **200 rows** per page (API cap also raised to 200)
- **Sortable headers**: Date, Description, Merchant, Category, Amount — click cycles asc → desc → reset
- **Inline cell editing**: click any of Description / Merchant / Category / Notes / Project / Amount
  - Text fields → `<input type="text">`, Amount → `<input type="number">`, Project → `<select>`
  - Enter / blur → PATCH `/api/transactions/[id]`, optimistic update
  - Escape → revert; error → red flash + revert
- **Per-row delete**: trash icon → row turns red + "Confirm?" for 3 s → second click DELETEs
- **Bulk delete**: checkboxes → toolbar appears → two-step confirm → parallel DELETEs
- Projects loaded once on mount from `/api/projects`

### 2. API: `GET /api/transactions` now accepts `sortBy` + `sortDir`
- `sortBy`: `date | amount | description | merchantName | category` (default: `date`)
- `sortDir`: `asc | desc` (default: `desc`)

### 3. API: `PATCH /api/transactions/[id]` schema extended
- Now accepts `description` and `amount` in addition to the original fields

### 4. Upload flow: deterministic header auto-mapper (`column-mapper.tsx`)
- `guessMapping(headers)` runs on mount once CSV headers arrive
- Normalises header strings (lowercase, strips spaces/underscores/dashes) then matches ranked regexes
- Maps: dateCol, amountCol, descCol, merchantCol, dateFormat
- Falls back gracefully — unmatched fields stay blank for manual selection
- **TODO**: replace/augment with an LLM-based mapper (hook is already commented in the code)

### 5. Institution seed: N26 (DE) added
- `Date` / `Amount (EUR)` / `Payment reference` / `Payee`
- `YYYY-MM-DD`, normal sign (negatives = expenses)

---

## Seeded institution schemas

| Name | Country | Key columns |
|---|---|---|
| Chase Credit Card | US | Transaction Date / Amount / Description |
| Chase Checking | US | Posting Date / Amount / Description |
| Capital One | US | Transaction Date / Debit / Description — YYYY-MM-DD |
| Bank of America | US | Date / Amount / Description |
| N26 | DE | Date / Amount (EUR) / Payment reference / Payee — YYYY-MM-DD |
| Monzo | UK | Date / Amount / Name |
| Starling Bank | UK | Date / Amount (GBP) / Counter Party |
| Barclays | UK | Date / Amount / Memo |
| HSBC UK | UK | Date / Paid out / Description — inverted sign |

---

## What's NOT done yet (natural next steps)

- [ ] **Dashboard** — `/dashboard/page.tsx` exists but has placeholder content; needs summary cards (total spend, by project, recent transactions)
- [ ] **Transactions page filters** — account filter and project filter dropdowns (UI missing, API already supports `accountId` and `projectId` params)
- [ ] **LLM column mapper** — `guessMapping()` is deterministic; slot in an LLM call before falling back to regex (see comment in `column-mapper.tsx`)
- [ ] **Projects page** — `/projects/page.tsx` is a stub; needs create/edit/delete UI
- [ ] **Accounts page** — `/accounts/page.tsx` exists; `/accounts/new/page.tsx` exists; review completeness
- [ ] **Category taxonomy** — `category` is a free-text string; could be an enum or a seeded lookup table
- [ ] **Tags** — `Transaction.tags` is a `String[]` in schema, no UI for it yet
- [ ] **OpenAPI spec** — planned at `/api/openapi.json`, not yet implemented
- [ ] **Tests** — none written yet

---

## Reference docs

- `docs/accounting-reference.md` — domain model, what the app is/isn't, CSV pipeline, category taxonomy design, accounting fundamentals, architecture guidance, open-source references.
- `docs/rules-engine-reference.md` — full rules engine design: auto-categorization (system + user rules), column mapping LLM fallback pattern, import validation, file layout, integration points, tests.

---

## Running the project

```bash
pnpm dev                  # start dev server on :3000
pnpm tsc --noEmit         # type-check (currently clean)
pnpm prisma db push       # sync schema to Neon
pnpm prisma db seed       # re-seed institution schemas
pnpm prisma studio        # browse the DB
```

Env vars needed in `.env` / `.env.local`:
```
DATABASE_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

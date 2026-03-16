# Backoffice AI — Accounting & Domain Reference

> **Purpose:** Offline reference for Claude Code sessions working on Backoffice AI.
> Covers the domain model, accounting fundamentals relevant to a freelancer finance tool,
> CSV normalization patterns, and architecture guidance that fits the actual stack.
>
> **Read the session handoff doc (`HANDOFF.md`) first** — it has the current file map,
> what's built, and what's next. This doc is the "why" and "how to think about it" layer.

---

## 1. What Backoffice AI Actually Is

A lightweight financial management tool for **freelancers, consultants, and small property managers**. Not a full double-entry accounting system. Not an ERP.

The core loop is:

1. User connects a bank account (selects an InstitutionSchema)
2. User uploads a CSV export from that bank
3. System normalizes the CSV into a standard Transaction shape (via PapaParse + column mapping)
4. User tags transactions to **Projects** (clients, properties, jobs)
5. System provides reporting/dashboard views by project, category, time period

Multi-country: US, UK, DE bank formats. Multi-user via Clerk.

### What this is NOT (at least in V1)

- Not double-entry bookkeeping (no journal entries, no debits/credits, no general ledger)
- Not invoicing or accounts receivable/payable
- Not tax filing or VAT returns
- Not a bank connection via Plaid/Open Banking (CSV import only for now)

If the app grows toward proper bookkeeping later, the double-entry patterns in Section 6 below will become relevant. For now, the data model is simpler: **Transactions belong to Accounts, and optionally to Projects.**

---

## 2. The Actual Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14, App Router, TypeScript | `src/` directory structure |
| Auth | Clerk | Middleware guards all routes except sign-in/sign-up |
| Database | PostgreSQL on Neon | Serverless Postgres |
| ORM | Prisma | `prisma/schema.prisma` is the source of truth for the data model |
| Styling | Tailwind CSS + shadcn/ui | Component library for UI primitives |
| CSV parsing | PapaParse | Runs client-side in the upload flow |
| Client state | Zustand | Lightweight store, no Redux |
| Validation | Zod + React Hook Form | API request validation + form handling |
| Package manager | pnpm | Not npm, not yarn |

### Commands

```bash
pnpm dev                  # dev server on :3000
pnpm tsc --noEmit         # type-check
pnpm prisma db push       # sync schema to Neon
pnpm prisma db seed       # re-seed institution schemas
pnpm prisma studio        # browse the DB
```

### API Pattern

All API routes live under `src/app/api/`. They're Next.js Route Handlers (not Pages API routes). They use a shared response helper (`src/lib/api-response.ts`) that provides `ok()`, `created()`, `badRequest()`, `notFound()`, `serverError()`.

Every route must check `auth()` from Clerk and scope queries to the authenticated user's `userId`. The Prisma client is a singleton from `src/lib/prisma.ts`.

---

## 3. Data Model

These are the core entities from `prisma/schema.prisma`:

### InstitutionSchema (seeded, global)

Describes how a specific bank's CSV export is structured. Seeded for 9 banks across US/UK/DE. Fields include which columns map to date, amount, description, merchant, and what date format to expect.

Not user-owned — these are global reference data.

### Account

A user's bank account. Belongs to a Clerk `userId`. Linked to an `InstitutionSchema` so the system knows how to parse that account's CSVs.

### Project

A user-defined grouping: `CLIENT | PROPERTY | JOB | OTHER`. Belongs to `userId`. Transactions are optionally tagged to a project. This is the primary organizational axis for freelancers — "how much did I spend/earn on Project X?"

### Transaction

The central entity. Belongs to an `Account`, optionally linked to a `Project` and an `ImportBatch`.

Key fields:
- `date` — transaction date
- `description` — raw description from the bank
- `merchantName` — extracted or user-edited merchant
- `category` — currently free-text (future: taxonomy/enum)
- `amount` — stored as a `Decimal` (Prisma), representing the actual currency value
- `currency` — ISO code (USD, GBP, EUR)
- `tags` — `String[]`, no UI yet
- `notes` — user-added notes
- `importHash` — SHA-256 hash for dedup (see `src/lib/dedup.ts`)

### ImportBatch

Groups transactions from a single CSV upload. Tracks filename, row count, status. Useful for "undo import" functionality and audit trail.

### Relationships

```
InstitutionSchema  1 ←──── * Account
Account            1 ←──── * Transaction
Project            1 ←──── * Transaction (optional)
ImportBatch        1 ←──── * Transaction (optional)
User (Clerk)       1 ←──── * Account
User (Clerk)       1 ←──── * Project
```

---

## 4. CSV Import & Normalization

This is the most complex flow in V1 and the area most likely to need rules engine work.

### The Pipeline

```
User drops CSV file
        │
        ▼
  PapaParse (client-side)
  Parse raw CSV → array of row objects
        │
        ▼
  Column Mapper (column-mapper.tsx)
  Map CSV headers → standard fields (dateCol, amountCol, descCol, merchantCol, dateFormat)
  Currently: deterministic regex via guessMapping()
  TODO: LLM-assisted mapper before regex fallback
        │
        ▼
  CSV Processor (src/lib/csv-processor.ts)
  Apply mapping → normalize into PreviewRow[]
  Handle date parsing, sign normalization, amount extraction
        │
        ▼
  Dedup (src/lib/dedup.ts)
  SHA-256 hash of (date + amount + description) → skip duplicates
        │
        ▼
  Import Preview (import-preview.tsx)
  User reviews normalized rows before committing
        │
        ▼
  POST /api/transactions/import
  Commit batch → create Transaction records + ImportBatch
```

### Bank Format Challenges

Different banks export CSVs very differently:

- **Amount representation**: Some use a single signed column (Chase, N26). Some split into Debit/Credit columns (Capital One). HSBC UK inverts the sign.
- **Date formats**: `MM/DD/YYYY` (most US), `DD/MM/YYYY` (most UK), `YYYY-MM-DD` (N26, Capital One).
- **Column naming**: "Transaction Date" vs "Posting Date" vs "Date". "Amount" vs "Amount (EUR)" vs "Paid out".
- **Merchant extraction**: Some banks put merchant name in the description field. Some have a separate payee/counterparty column. Some mangle it with transaction codes.

The `guessMapping()` function in `column-mapper.tsx` handles this with ranked regexes against normalized header names. It works for the 9 seeded schemas but will need the LLM fallback for unknown bank formats.

### Amount Handling

Amounts are stored as Prisma `Decimal` type, which maps to PostgreSQL `NUMERIC`. This avoids floating-point precision issues. The currency is stored alongside as an ISO code.

Negative amounts = money out (expenses). Positive amounts = money in (income). Some banks invert this (HSBC UK) — the CSV processor handles sign normalization based on the InstitutionSchema configuration.

---

## 5. Category Taxonomy (Future)

Currently `category` is free-text on Transaction. The handoff doc flags this as a next step. Here's the recommended approach:

### Why a Taxonomy

- Consistent reporting ("Office Supplies" vs "office supplies" vs "Office" shouldn't be three categories)
- Enables auto-categorization rules (see rules-engine-reference.md)
- Standard categories make dashboard/reporting meaningful
- Users can still create custom categories

### Suggested Schema Addition

```prisma
model Category {
  id          String   @id @default(cuid())
  name        String                         // "Office Supplies"
  slug        String   @unique               // "office-supplies"
  parentId    String?                        // for hierarchy
  parent      Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children    Category[] @relation("CategoryTree")
  type        CategoryType                   // INCOME | EXPENSE | TRANSFER
  isSystem    Boolean  @default(false)       // seeded categories can't be deleted
  userId      String?                        // null = global, set = user-custom
  transactions Transaction[]
}

enum CategoryType {
  INCOME
  EXPENSE
  TRANSFER
}
```

### Seed Categories

A sensible starter set for freelancers:

**Expenses:** Office Supplies, Software & Subscriptions, Travel, Meals & Entertainment, Professional Services, Insurance, Rent & Utilities, Equipment, Marketing, Education & Training, Bank Fees, Taxes & Licenses, Vehicle, Miscellaneous Expense

**Income:** Client Payment, Interest, Refund, Other Income

**Transfers:** Account Transfer, Owner Draw, Owner Contribution

These should be seeded as `isSystem: true` so they can't be deleted but can be supplemented with user-created categories.

---

## 6. Accounting Fundamentals (Future Reference)

This section is reference material for when Backoffice AI grows beyond transaction tagging. Not needed for V1 but worth having in context when building reporting features.

### The Accounting Equation

```
Assets = Liabilities + Equity
```

For a freelancer, this simplifies to: what you have (bank accounts) minus what you owe, equals what the business is worth.

### Account Types

| Type | Normal Balance | Freelancer Examples |
|---|---|---|
| Assets | Debit (+) | Bank accounts, equipment, accounts receivable |
| Liabilities | Credit (-) | Credit cards, loans, tax owed |
| Equity | Credit (-) | Owner's investment, retained earnings |
| Revenue | Credit (-) | Client payments, interest income |
| Expenses | Debit (+) | Rent, software, travel, meals |

### Why This Matters for Reporting

Even though V1 doesn't do double-entry bookkeeping, the dashboard and reports still need to understand the difference between income and expenses, and group transactions correctly. The category taxonomy (Section 5) maps naturally to these account types — every category is either INCOME, EXPENSE, or TRANSFER.

### Profit & Loss for Freelancers

The most useful report for the target users is a simple P&L:

```
Revenue (sum of INCOME category transactions)
- Expenses (sum of EXPENSE category transactions)
= Net Profit/Loss

Optionally broken down by:
  - Project (client/property/job)
  - Category
  - Time period (month/quarter/year)
  - Account (which bank account)
```

This doesn't require double-entry — it's just summing and grouping transactions by their category type and project. The Transaction table already has all the data needed.

### Tax Reporting Basics

For US freelancers, the key tax categories map to **Schedule C** line items. For UK, it's the **Self Assessment** categories. For DE, it's the **EÜR (Einnahmenüberschussrechnung)** categories.

A future feature could tag categories with their tax-form mapping, so users can export a tax-ready summary. But this is well beyond V1.

---

## 7. Architecture Guidance for Claude Code

### File Placement

- New API routes → `src/app/api/{resource}/route.ts`
- New pages → `src/app/{path}/page.tsx`
- Shared types → `src/types/index.ts`
- Business logic → `src/lib/{module}.ts`
- React components → `src/components/{feature}/{component}.tsx`
- Zustand stores → `src/store/{name}.ts` (if this pattern exists; check first)

### API Route Pattern

```typescript
import { auth } from '@clerk/nextjs';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, badRequest, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return new Response('Unauthorized', { status: 401 });

    // Always scope queries to userId
    const results = await prisma.transaction.findMany({
      where: { account: { userId } },
      // ... pagination, sorting, filtering
    });

    return ok(results);
  } catch (error) {
    return serverError(error);
  }
}
```

### Prisma Patterns

- Always filter by `userId` through the Account relation (transactions don't have a direct userId)
- Use `Decimal` for amounts, never `Float`
- Use `include` for relations, but be selective (don't over-fetch)
- Run `pnpm prisma db push` after schema changes, then `pnpm prisma generate`

### Component Patterns

- shadcn/ui for primitives (Button, Input, Select, Dialog, etc.)
- Tailwind for layout and custom styling
- Zustand for client state that needs to persist across components
- React Hook Form + Zod for any form with validation
- Optimistic updates for inline editing (update UI immediately, revert on API error)

### Testing (When Added)

No tests exist yet. When they're added:
- API route tests: use a test database, seed with known data, assert responses
- Component tests: React Testing Library, mock the API calls
- Key invariants to test:
  - Transactions always scoped to authenticated user
  - Import dedup works (same CSV uploaded twice → no duplicate transactions)
  - Amount sign normalization correct for each seeded bank format
  - Column mapper produces correct mapping for each seeded InstitutionSchema

---

## 8. Open-Source References

Projects worth studying for patterns relevant to Backoffice AI:

| Project | Why It's Relevant |
|---|---|
| **Frappe Books** (github.com/frappe/books) | Vue + Electron + SQLite. Clean offline-first accounting UI for small businesses. Good for UI/UX patterns, especially the transaction list and reporting views. |
| **Akaunting** (github.com/akaunting/akaunting) | Laravel. Full-featured open-source accounting. Good reference for category taxonomy, multi-currency, and reporting. |
| **Maybe** (github.com/maybe-finance/maybe) | Rails + Next.js. Personal finance app. Closer to what Backoffice AI does — transaction import, categorization, net worth tracking. Good for bank sync and category patterns. |
| **Actual Budget** (github.com/actualbudget/actual) | React + SQLite. Budgeting app with bank import. Excellent reference for CSV import UX, rule-based categorization, and local-first architecture. |
| **Firefly III** (github.com/firefly-iii/firefly-iii) | PHP. Self-hosted personal finance manager. Has a mature rules engine for auto-categorizing transactions based on description, amount, and other fields. Directly relevant to the rules engine work. |

---

*This document lives at `docs/accounting-reference.md` in the project repo.
Companion doc: `docs/rules-engine-reference.md` (auto-categorization, validation, category rules).*

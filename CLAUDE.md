# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm lint         # Run ESLint
pnpm db:push      # Push Prisma schema changes to database
pnpm db:seed      # Seed database with initial data
pnpm db:studio    # Open Prisma Studio (DB browser)
```

There are no automated tests in this project.

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk auth
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`
- `OPENROUTER_API_KEY` — for AI features

## Architecture

**Stack:** Next.js App Router, TypeScript, PostgreSQL (Neon) + Prisma, Clerk auth, Tailwind CSS 4, shadcn/ui (base-nova), Zustand, Recharts, date-fns, decimal.js.

### Data Model

All user data is isolated by Clerk `userId` (no org-level sharing). Core Prisma models:

- `Account` — bank accounts/cards; each belongs to an `InstitutionSchema`
- `Transaction` — financial transactions; `amount` is signed (negative = expense, positive = income); duplicate detection via SHA-256 `duplicateHash` over `(accountId, date, amount, description)`; `rawData` preserves the original CSV row
- `Category` / `CategoryGroup` — hierarchical; groups carry `scheduleRef` and `taxType` for tax schedule mapping
- `Payee` — counterparties; unique per `(userId, name)`; have a `defaultCategoryId`
- `CategorizationRule` — user-defined rules; `conditions` JSON stores `{ all?: ConditionDef[], any?: ConditionDef[] }`; `priority` 1–99 (lower = evaluated first, system rules are 100+); can set category, payee, project, notes, and tags on match
- `RuleSuggestion` — AI-generated rule candidates derived from transaction edits; status `PENDING | ACCEPTED | IGNORED`
- `ImportBatch` — tracks CSV import sessions; records `skippedCount` for duplicates
- `InstitutionSchema` — global (non-user) CSV column mapping templates; `csvMapping` JSON: `{ dateCol, amountCol, descCol, dateFormat, amountSign }`
- `Project` — client/property/job entities for tagging transactions; `ProjectType`: `CLIENT | PROPERTY | JOB | OTHER`
- `UserPreference` — one row per user, `data` JSON for arbitrary UI state

### API Routes (`src/app/api/`)

Each resource has its own directory (e.g. `api/transactions/`, `api/rules/`). All routes:
- Are protected by Clerk middleware (`src/middleware.ts`)
- Extract `userId` via `auth()` from `@clerk/nextjs/server`
- Return responses via helpers in `src/lib/api-response.ts`: `ok()`, `created()`, `badRequest()`, `unauthorized()`, `notFound()`, `serverError()` — all return `{ data, error, meta? }`

Agent routes (`api/agent/`) stream SSE responses using `ReadableStream` with `text/event-stream`. Events are typed: `{ type: 'status' | 'answer' | 'done' | 'error', ... }`.

### Rules Engine (`src/lib/rules/`)

- `engine.ts` — generic `evaluateRules<TFact, TResult>(fact, rules, strategy)` where `strategy` is `'first'` (stop on first match) or `'all'`
- `categorization.ts` — defines `TransactionFact` and `CategorizationResult` types
- `conditions.ts` — helpers: `containsAny`, `isExpense`, `isIncome`, `allOf`, `anyOf`
- `user-rules.ts` — `loadUserRules(userId)` loads `CategorizationRule` rows from DB and hydrates them into `Rule` objects; `buildCondition()` interprets the conditions JSON
- `system-rules.ts` — built-in fallback rules at priority 100+
- `categorize-batch.ts` — runs rules against an array of transactions during import

Rule condition fields: `description`, `payeeName`, `rawDescription`, `amount`, `currency`, `accountName`, `notes`, `tag`, `date`, `month`, `dayOfWeek`. Operators include `contains`, `not_contains`, `equals`, `not_equals`, `starts_with`, `ends_with`, `regex`, `gt`, `lt`, `gte`, `lte`, `in`/`oneOf`, `between`.

### LLM / Agent Integration (`src/lib/llm/`, `src/lib/agent/`)

`src/lib/llm/openrouter.ts` exposes two functions:
- `openrouterChat(messages, model?)` — simple text completion; default model `mistralai/devstral-small`
- `openrouterWithTools(messages, tools, model?)` — tool-calling with streaming SSE accumulation; default model `mistralai/mistral-small-2603`; streams to avoid serverless timeouts

Agent routes use a router model (`google/gemini-2.0-flash-lite-001`) to classify questions as `simple` (→ Claude Sonnet 4.6) or `complex` (→ Claude Opus 4.6), then run an agentic tool loop (max 4 or 8 rounds respectively).

`src/lib/agent/finance-tools.ts` defines `FINANCE_TOOLS` (OpenAI-format tool definitions) and `dispatchTool(userId, toolName, args)`. Tools include `query_transactions`, `aggregate_transactions`, `get_categories`, etc.

`src/lib/agent/rules-tools.ts` — similar tool set for the rules-generation agent.

### CSV Import Flow

1. Upload (`/upload`, `api/upload/`) — parse CSV client-side via `src/components/upload/csv-dropzone.tsx`; store in Zustand (`src/stores/upload-store.ts`)
2. Column mapping (`src/components/upload/column-mapper.tsx`) — LLM validates/maps headers via `api/llm/validate-mapping/`
3. Import preview (`src/components/upload/import-preview.tsx`) — apply institution schema
4. Final import (`api/transactions/import/`) — dedup via `src/lib/dedup.ts` (`buildDuplicateHash`), then batch-categorize, insert transactions and update `ImportBatch`

### Dashboard Widgets (`src/components/widgets/`, `src/lib/widgets/`)

Each widget fetches from a dedicated `api/widgets/` endpoint (`cashflow`, `categories`, `networth`, `data`). Widgets use a relative date range picker (`RelativeDateRangePicker.tsx`) where the applied range is stored separately from in-progress selection. Chart rendering is handled by `ChartRouter.tsx` which dispatches to `AreaChartWidget`, `BarChartWidget`, `DonutChartWidget`, or `LineChartWidget`.

Widget data pipeline: `src/lib/widgets/data-fetcher.ts` → `data-transformer.ts` → component. Colors: `src/lib/widgets/colors.ts`. Date helpers: `src/lib/widgets/date-utils.ts`.

### Client State

Zustand stores in `src/stores/`:
- `upload-store.ts` — CSV import multi-step flow state
- `chat-store.ts` — AI chat overlay state

Server data fetching uses standard Next.js patterns (server components + `fetch` in client components). Shared types live in `src/types/index.ts` and `src/types/widgets.ts`.

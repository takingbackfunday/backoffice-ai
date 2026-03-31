# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

**Commit without pushing** during development. Never run `git push` unless the user explicitly asks. This avoids triggering Netlify deploys on every change.

## Commands

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm lint         # Run ESLint
pnpm db:push      # Push Prisma schema changes to database
pnpm db:seed      # Seed database with initial data
pnpm db:studio    # Open Prisma Studio (DB browser)
```

**IMPORTANT — always prefix DB commands with DATABASE_URL:**

```bash
DATABASE_URL="$(netlify env:get DATABASE_URL)" pnpm db:push
DATABASE_URL="$(netlify env:get DATABASE_URL)" pnpm prisma generate
```

Prisma's config loader does not read `.env.local` for CLI commands.

There are no automated tests in this project.

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk auth
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`
- `OPENROUTER_API_KEY` — for AI features
- `BROWSERLESS_TOKEN` — Browserless.io API token for cloud browser sessions
- `ENCRYPTION_SECRET` — derives AES-256 keys for encrypted bank credentials

## Architecture

**Stack:** Next.js App Router, TypeScript, PostgreSQL (Neon) + Prisma, Clerk auth, Tailwind CSS 4, shadcn/ui (base-nova), Zustand, Recharts, date-fns, decimal.js.

### Data Model

All user data is isolated by Clerk `userId` (no org-level sharing). Core Prisma models:

- `Account` — bank accounts/cards; each belongs to an `InstitutionSchema`
- `Transaction` — financial transactions; `amount` is signed (negative = expense, positive = income); duplicate detection via SHA-256 `duplicateHash` over `(accountId, date, amount, description)`; `rawData` preserves the original CSV row
- `Category` / `CategoryGroup` — hierarchical; groups carry `scheduleRef` and `taxType` for tax schedule mapping
- `Payee` — counterparties; unique per `(userId, name)`; have a `defaultCategoryId`
- `CategorizationRule` — user-defined rules; `conditions` JSON stores `{ all?: ConditionDef[], any?: ConditionDef[] }`; `priority` 1–99 (lower = evaluated first); can set category, payee, project, notes, and tags on match
- `RuleSuggestion` — AI-generated rule candidates derived from transaction edits; status `PENDING | ACCEPTED | IGNORED`
- `ImportBatch` — tracks CSV import sessions; records `skippedCount` for duplicates
- `InstitutionSchema` — global (non-user) CSV column mapping templates; `csvMapping` JSON: `{ dateCol, amountCol, descCol, dateFormat, amountSign }`
- `Project` — client/property/job entities for tagging transactions; `ProjectType`: `CLIENT | PROPERTY | JOB | OTHER`
- `Job` — sub-unit of a CLIENT project; `status` enum `ACTIVE | COMPLETED | CANCELLED` (no `isActive` field)
- `ClientProfile` — contact record linked to a project; holds `email`, `contactName`
- `Invoice` — belongs to a `ClientProfile`; `status`: `DRAFT | SENT | PARTIAL | OVERDUE | PAID | VOID`; `replacesInvoiceId` self-relation (`@unique`) enables renegotiation chain — one voided invoice maps to one replacement
- `InvoiceLineItem` — line on an invoice; `isTaxLine: true` marks tax lines (no separate tax model)
- `InvoicePayment` — payment against an invoice; `transactionId` (`@unique`) optionally links to a bank `Transaction`; amount triggers automatic `PARTIAL` / `PAID` status update
- `InvoicePaymentSuggestion` — auto-generated match between a `Transaction` and an `Invoice`; `confidence`: `HIGH | MEDIUM`; `status`: `PENDING | ACCEPTED | DISMISSED`; HIGH confidence matches are auto-applied at import time
- `UserPreference` — one row per user, `data` JSON for arbitrary UI state
- `BankPlaybook` — stores discovered browser automation steps for each connected bank account; `steps` JSON contains `PlaybookStep[]` array; `twoFaType` tracks 2FA method; `status` indicates verification state
- `EncryptedCredential` — AES-256-GCM encrypted bank login credentials (username:password); scoped per account with unique IV and auth tag
- `SyncJob` — tracks bank sync operations with status progression: `PENDING` → `CONNECTING` → `DOWNLOADING` → `IMPORTING` → `COMPLETE/FAILED`

### API Routes (`src/app/api/`)

Each resource has its own directory (e.g. `api/transactions/`, `api/rules/`). All routes:
- Are protected by Clerk middleware (`src/middleware.ts`)
- Extract `userId` via `auth()` from `@clerk/nextjs/server`
- Return responses via helpers in `src/lib/api-response.ts`: `ok()`, `created()`, `badRequest()`, `unauthorized()`, `notFound()`, `serverError()` — all return `{ data, error, meta? }`

Agent routes (`api/agent/`) stream SSE responses using `ReadableStream` with `text/event-stream`. Events are typed: `{ type: 'status' | 'answer' | 'done' | 'error', ... }`.

### Rules Engine (`src/lib/rules/`)

- `engine.ts` — generic `evaluateRules<TFact, TResult>(fact, rules, strategy)` where `strategy` is `'first'` (stop on first match) or `'all'`
- `categorization.ts` — defines `TransactionFact` and `CategorizationResult` types
- `evaluate-condition.ts` — shared condition evaluation used by both `user-rules.ts` and `rules-tools.ts`; exports `getFieldValue`, `evaluateOperator`, `matchesConditions`, and `ConditionDef`
- `user-rules.ts` — `loadUserRules(userId)` loads `CategorizationRule` rows from DB and hydrates them into `Rule` objects; `buildCondition()` interprets the conditions JSON
- `categorize-batch.ts` — runs rules against an array of transactions during import

Rule condition fields: `description`, `payeeName`, `rawDescription`, `amount`, `currency`, `accountName`, `notes`, `tag`, `date`, `month`, `dayOfWeek`. Operators include `contains`, `not_contains`, `equals`, `not_equals`, `starts_with`, `ends_with`, `regex`, `gt`, `lt`, `gte`, `lte`, `in`/`oneOf`, `between`.

### LLM / Agent Integration (`src/lib/llm/`, `src/lib/agent/`)

`src/lib/llm/openrouter.ts` exposes two functions:
- `openrouterChat(messages, model?)` — simple text completion; default model `mistralai/devstral-small`
- `openrouterWithTools(messages, tools, model?)` — tool-calling with streaming SSE accumulation; default model `mistralai/mistral-small-2603`; streams to avoid serverless timeouts

### Multi-Agent System (`src/lib/agent/`)

The ask route (`POST /api/agent/ask`) uses a multi-agent orchestration pattern:

1. **Orchestrator** (`orchestrator.ts`) — entry point; calls domain classifier, routes to primary agent, handles handoffs
2. **Domain Classifier** (`domain-classifier.ts`) — uses `google/gemini-2.0-flash-lite-001` to classify questions as `finance`, `property`, or both; returns `{ primary, secondary, reasoning }`
3. **Finance Agent** (`finance-agent.ts`) — wraps the existing finance tool loop; first routes question to `simple`/`complex` via a second Gemini call; uses 4 or 8 tool rounds accordingly; signals handoff via `[NEEDS_PROPERTY_AGENT]` marker
4. **Property Agent** (`property-agent.ts`) — queries properties, units, leases, tenants, payments, maintenance via 13 property tools (max 6 rounds); signals handoff via `[NEEDS_FINANCE_AGENT]`
5. **Shared utilities**:
   - `tool-loop.ts` — reusable `runToolLoop({ messages, tools, dispatchTool, model, maxRounds, onStatus })` → `{ answer, toolsUsed }`
   - `format-history.ts` — `formatHistory(turns)` formats `ConversationTurn[]` as a readable string for system prompts
   - `types.ts` — `AgentDomain`, `Agent`, `AgentContext`, `AgentResult`, `ConversationTurn`, `SseEvent`, `MAX_TURNS=3`

**Property tools** (`property-tools.ts`): `list_properties`, `get_property`, `list_units`, `get_occupancy_summary`, `list_leases`, `get_tenant`, `get_rent_roll`, `get_tenant_balance`, `list_tenant_payments`, `list_overdue_tenants`, `list_maintenance_requests`, `get_property_revenue`, `get_vacancy_cost`.

**Conversation memory**: client-side Zustand store (`chat-store.ts`) holds `sessionId` + `turns: ConversationTurn[]` (max `MAX_TURNS*2` items = 3 pairs). History is sent as `conversationHistory` in each request body; the route passes it to the orchestrator, which includes it in system prompts via `formatHistory()`. The `AgentQA` component (`src/components/dashboard/agent-qa.tsx`) renders conversation as a chat thread and calls `addTurn()` on each completed exchange.

Agent models: all agents use `anthropic/claude-sonnet-4.6`; domain classifier and finance router use `google/gemini-2.0-flash-lite-001`.

`src/lib/agent/finance-tools.ts` defines `FINANCE_TOOLS` (OpenAI-format tool definitions) and `dispatchTool(userId, toolName, args)`. Tools include `query_transactions`, `aggregate_transactions`, `get_categories`, etc.

`src/lib/agent/rules-tools.ts` — similar tool set for the rules-generation agent. The SSE endpoint (`api/agent/rules`) has a 30-second per-user cooldown stored in `UserPreference.data.lastRulesAgentRun`. The `consecutiveRejections` counter is NOT reset per round — only a successful emit resets it, so persistent bad suggestions accumulate toward the cap across rounds.

### Bank Agent (`src/lib/bank-agent/`, `src/app/api/bank-agent/`)

Cloud-browser automation for syncing bank transactions. Uses `playwright-core` (NOT `playwright` — no local browser) connecting to Browserless.io via WebSocket CDP.

- `src/lib/bank-agent/worker.ts` — core automation: `connectBank()` for first-time LLM-guided login + CSV discovery, `syncBank()` for replaying saved playbooks. Uses `safeLocatorAction()` to handle Playwright strict mode violations (falls back to `.first()`). `captureDownload()` handles both file download events and navigation-based CSV responses.
- `src/lib/bank-agent/crypto.ts` — AES-256-GCM encryption; key is derived per-user as `sha256(ENCRYPTION_SECRET + userId)` so one server secret yields unique per-user keys.
- `src/types/bank-agent.ts` — `PlaybookStep`, `PageElement`, `SyncJobEvent` types.

API routes (all SSE-streaming, same pattern as `api/agent/ask`):
- `POST /api/bank-agent/connect` — first-time connection: runs LLM browser agent, saves `BankPlaybook` + `EncryptedCredential`, imports CSV
- `POST /api/bank-agent/sync` — replay saved playbook, re-import
- `GET /api/bank-agent/status?accountId=X` — playbook status + last 10 sync jobs
- `POST /api/bank-agent/disconnect` — deletes playbook, credentials, sync jobs

2FA: passive by default (agent waits for user to approve push/SMS on their device). OTP-input fallback uses Browserless `liveURL` (requires paid plan). Free tier covers normal 2FA flows.

Nav model: `anthropic/claude-sonnet-4.6`. LLM prompt requires raw JSON output — fallback regex extracts `{...}` from prose if model wraps response. `STEP_DELAY_MS = 800ms`. Netlify timeout: 120s for both connect and sync routes.

**Never log credentials** — username/password are passed as params but must never appear in `console.log`.

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
- `chat-store.ts` — AI chat overlay state + conversation memory (`sessionId`, `turns`, `addTurn`, `clearHistory`)

Server data fetching uses standard Next.js patterns (server components + `fetch` in client components). Shared types live in `src/types/index.ts` and `src/types/widgets.ts`.

## Known Gotchas

### Prisma v7 generated client path

Prisma 7 (`prisma-client` generator) outputs to `src/generated/prisma/` **without** an `index.ts`. The entry point is `client.ts`. All imports must use:

```ts
import { PrismaClient } from '@/generated/prisma/client'
// NOT: '@/generated/prisma'  ← breaks in v7
```

`src/generated/` is gitignored. On deploy Netlify runs `prisma generate` automatically. Locally, run it manually with `DATABASE_URL` prefixed (see Commands above).

### Job model has no `isActive` field

`Job` uses a `status` enum (`JobStatus`: `ACTIVE`, `COMPLETED`, `CANCELLED`). Filter active jobs with `{ status: 'ACTIVE' }`, not `{ isActive: true }`.

### Invoice AI routes expect JSON from the model

`ai-assist` and `ai-finalize` routes call `anthropic/claude-sonnet-4.6` via `openrouterChat()` and parse the response as JSON. The routes strip markdown code fences and fall back to extracting the first `{...}` block — so a plain JSON response and a fenced code block both work. If the model returns unparseable output, the routes return an empty actions array gracefully rather than erroring.

### `isTaxLine` on `InvoiceLineItem`

Tax is stored as a regular line item with `isTaxLine: true`. This avoids a separate model. When serializing invoices from server components, always include `isTaxLine` in the mapped output so client components can distinguish tax lines from regular ones.

### React Rules of Hooks in client components

All `useState` and `useReducer` calls must be declared at the top level of the component function — never inside helper functions, shims, or conditional branches. The linter enforces `react-hooks/rules-of-hooks`.

### Invoice matching runs synchronously — no fire-and-forget

Netlify serverless kills the process immediately after the response is sent. Matching functions (`matchInvoicePayments`, `matchTenantPayments`) must be `await`ed before returning — use `await Promise.allSettled([...])`. Fire-and-forget `.then().catch()` chains will silently never run.

### Invoice renegotiation flow

`POST /api/projects/[id]/invoices/[invoiceId]/renegotiate` voids the original invoice and creates a replacement DRAFT in a single `$transaction`. Guards: status must be `SENT | PARTIAL | OVERDUE` and `replacedBy` must be null. The replacement carries `replacesInvoiceId` pointing back to the voided original. If `totalPaid > 0` a credit line item with negative `unitPrice` is prepended to the replacement.

### PDF generation

`GET /api/projects/[id]/invoices/[invoiceId]/pdf` generates a PDF via `generateInvoicePdf` (react-pdf/renderer, `src/lib/pdf/invoice-pdf.ts`). The response must wrap the buffer in `new Uint8Array(pdfBuffer)` — passing a `Buffer` directly fails TypeScript (`Buffer` is not assignable to `BodyInit`).

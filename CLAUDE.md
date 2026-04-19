# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

**Commit without pushing** during development. Never run `git push` unless the user explicitly asks. Pushing to `main` triggers a Fly.io deploy via GitHub Actions. To deploy manually without pushing: `fly deploy`.

**After pushing**, always verify the deploy succeeded via GitHub Actions:
```bash
gh run list --repo takingbackfunday/backoffice-ai --limit 3
```
The top entry should show `completed / success` for the commit just pushed. Do not use `fly logs` for this — it streams indefinitely and blocks.

## Database Access

Use the Neon PostgreSQL DB directly (via `DIRECT_URL`) for all queries. **Never use BigQuery** — this project does not use BigQuery.

## Development Credentials (rotate before production)

```
DIRECT_URL=postgresql://neondb_owner:npg_NGJVWsFuk58h@ep-super-wave-alq120gl.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

## Commands

```bash
pnpm dev          # Start development server
pnpm build        # Build for production (includes prisma generate)
pnpm lint         # Run ESLint
pnpm db:push      # Push Prisma schema changes to database
pnpm db:seed      # Seed database with initial data
pnpm db:studio    # Open Prisma Studio (DB browser)
fly deploy        # Deploy to Fly.io
fly logs          # Tail production logs
fly ssh console   # SSH into the running container
```

**IMPORTANT — DB CLI commands use `DIRECT_URL` (non-pooled connection):**

```bash
DIRECT_URL="<direct-connection-string>" pnpm db:push
DIRECT_URL="<direct-connection-string>" pnpm prisma generate
```

Prisma's config loader does not read `.env.local` for CLI commands. `DIRECT_URL` must be the non-pooled Neon connection string (no `-pooler` in hostname). `DATABASE_URL` (pooled) is used by the running app.

There are no automated tests in this project.

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk auth
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`
- `OPENROUTER_API_KEY` — for AI features
- `BROWSERLESS_TOKEN` — Browserless.io API token for cloud browser sessions (browser-agent fallback only)
- `ENCRYPTION_SECRET` — derives AES-256 keys for encrypted bank credentials; also used as HMAC secret for document upload tokens
- `PLAID_CLIENT_ID`, `PLAID_SECRET` — Plaid API credentials (US bank sync); `PLAID_ENV`: `sandbox | development | production` (default: `sandbox`)
- `FINEXER_CLIENT_ID`, `FINEXER_CLIENT_SECRET` — Finexer Open Banking credentials (UK bank sync)
- `ENABLE_BANKING_CLIENT_ID`, `ENABLE_BANKING_CLIENT_SECRET` — Enable Banking credentials (EU bank sync, 29 countries); `ENABLE_BANKING_BASE_URL` optional (defaults to production)
- `DIRECT_URL` — Neon PostgreSQL **non-pooled** connection string (no `-pooler` in hostname); used by Prisma CLI only
- `UPLOADTHING_TOKEN` — Uploadthing API token for file storage
- `MISTRAL_API_KEY` — Mistral API key for receipt OCR (`mistral-ocr-latest`); get from https://console.mistral.ai/
- `RESEND_API_KEY` — Resend transactional email (document request emails, invoice emails); optional — skipped gracefully if absent
- `RESEND_FROM` — sender address, e.g. `Backoffice <noreply@backoffice.cv>`; defaults to that value if unset
- `NEXT_PUBLIC_APP_URL` — public base URL used in email links; defaults to `https://backoffice.cv`

## Architecture

**Stack:** Next.js App Router (`output: "standalone"`), TypeScript, PostgreSQL (Neon) + Prisma 7 (via `@prisma/adapter-neon` WebSocket transport), Clerk auth, Tailwind CSS 4, shadcn/ui (base-nova), Zustand, Recharts, date-fns, decimal.js.

**Hosting:** Fly.io (shared-cpu-1x, 1GB RAM, single persistent container, `fra` region — matches Neon EU Central 1). Deployed via `fly deploy` or GitHub Actions on push to `main`. VM suspends after ~5 min idle and resumes in ~300ms.

**Database driver:** `@prisma/adapter-neon` (`PrismaNeon`) with `@neondatabase/serverless` — WebSocket transport, full transaction support. `pg` / `@types/pg` are not in the project. `next.config.ts` lists `sharp`, `playwright-core`, `@react-pdf/renderer`, and `prisma` in `serverExternalPackages`.

### Data Model

All user data is isolated by Clerk `userId` (no org-level sharing). Core Prisma models:

- `Account` — bank accounts/cards; each belongs to an `InstitutionSchema`
- `Transaction` — financial transactions; `amount` is signed (negative = expense, positive = income); duplicate detection via SHA-256 `duplicateHash` over `(accountId, date, amount, description)`; `rawData` preserves the original CSV row
- `Category` / `CategoryGroup` — hierarchical; groups carry `scheduleRef` and `taxType` for tax schedule mapping
- `Payee` — counterparties; unique per `(userId, name)`; have a `defaultCategoryId`
- `CategorizationRule` — user-defined rules; `conditions` JSON stores `{ all?: ConditionDef[], any?: ConditionDef[] }`; `priority` 1–99 (lower = evaluated first); can set category, payee, project, notes, and tags on match
- `RuleSuggestion` — AI-generated rule candidates derived from transaction edits or the self-learning agent; status `PENDING | ACCEPTED | IGNORED`; `workspaceId` / `workspaceName` (denormalised) carry a project assignment when the suggestion includes one
- `ImportBatch` — tracks CSV import sessions; records `skippedCount` for duplicates
- `InstitutionSchema` — global (non-user) CSV column mapping templates; `csvMapping` JSON: `{ dateCol, amountCol, descCol, dateFormat, amountSign }`
- `Project` — client/property/job entities for tagging transactions; `WorkspaceType` (mapped as `ProjectType` in DB): `CLIENT | PROPERTY | OTHER`
- `Job` — sub-unit of a CLIENT project; `status` enum `ACTIVE | COMPLETED | CANCELLED` (no `isActive` field); `billingType` and `defaultRate` override the parent `ClientProfile` defaults when set
- `ClientProfile` — contact record linked to a project; holds `email`, `contactName`
- `Estimate` — internal costing document scoped to a `Workspace` (project) via `workspaceId`; `jobId` is an optional legacy field (job binding happens at Quote time, not Estimate time); never shown to the client; `status`: `DRAFT | FINAL | SUPERSEDED`; `parentId` self-relation enables version chains; sections → items hierarchy
- `EstimateSection` — named group of `EstimateItem` rows within an `Estimate`; `sortOrder` controls display order
- `EstimateItem` — single line in an estimate; holds `hours` (effort per unit), `costRate` (internal cost per hour — never shown to client), `quantity` (number of units), `unit` (label for what quantity counts, e.g. "eps", "days"), `tags` (used for margin rule matching), `isOptional`, `internalNotes`, `riskLevel`
- `Quote` — client-facing commitment derived from an `Estimate`; `status`: `DRAFT | SENT | ACCEPTED | REJECTED | SUPERSEDED | AMENDED`; `previousVersionId` self-relation (`@unique`) for negotiation version chain; `parentQuoteId` for post-acceptance amendments (`isAmendment: true`); `overrides` JSON stores human decisions (margins, grouping, scope edits) so they survive regeneration; `quoteNumber` auto-generated as `QTE-XXXX`
- `QuoteSection` / `QuoteLineItem` — client-facing line items; `sourceItemIds` records which `EstimateItem` IDs were collapsed into each line; `costBasis` and `marginPercent` are internal-only; `hasEstimateLink: false` marks manually added lines
- `MarginRule` — user-level default margin per work tag (e.g. "design" → 60%); `@@unique([userId, tag])`; applied automatically during quote generation
- `Invoice` — belongs to a `ClientProfile`; `status`: `DRAFT | SENT | PARTIAL | OVERDUE | PAID | VOID`; `replacesInvoiceId` self-relation (`@unique`) enables renegotiation chain — one voided invoice maps to one replacement; `quoteId` optionally links the invoice to the `Quote` it fulfills (null for invoices created directly)
- `InvoiceLineItem` — line on an invoice; `isTaxLine: true` marks tax lines (no separate tax model)
- `InvoicePayment` — payment against an invoice; `transactionId` (`@unique`) optionally links to a bank `Transaction`; amount triggers automatic `PARTIAL` / `PAID` status update; payments can be deleted (`DELETE /payments/[paymentId]`) or moved to another open invoice (`PATCH /payments/[paymentId]`) — both recalculate invoice status atomically
- `InvoicePaymentSuggestion` — auto-generated match between a `Transaction` and an `Invoice`; `confidence`: `HIGH | MEDIUM`; `status`: `PENDING | ACCEPTED | DISMISSED`; HIGH confidence matches are auto-applied at import time
- `UserPreference` — one row per user, `data` JSON for arbitrary UI state. Known keys: `businessName`, `yourName`, `fromEmail`, `fromPhone`, `fromAddress`, `fromVatNumber`, `fromWebsite` (sender details on invoices), `paymentMethods` (bank/PayPal/Stripe/custom), `invoicePaymentNote`, `invoiceDefaults` (tax, currency, notes), `lastRulesAgentRun`, `dashboardCurrency` (`'USD' | 'EUR' | 'GBP'` — display currency for dashboard totals)
- `FxRate` — monthly EUR-base exchange rates for currency conversion; `(month, base, quote)` unique; `isOfficial: false` = carry-forward of latest known rate; seeded from ECB via Frankfurter.app for 2000-01 to present; refreshed via `POST /api/fx-rates/refresh`
- `BankPlaybook` — stores discovered browser automation steps for each connected bank account; `steps` JSON contains `PlaybookStep[]` array; `twoFaType` tracks 2FA method; `status` indicates verification state
- `EncryptedCredential` — AES-256-GCM encrypted bank login credentials (username:password); scoped per account with unique IV and auth tag
- `SyncJob` — tracks bank sync operations with status progression: `PENDING` → `CONNECTING` → `DOWNLOADING` → `IMPORTING` → `COMPLETE/FAILED`
- `Listing` — property listing linked to a `Unit`; `requiredDocs Json @default("[]")` holds an array of doc-type keys that applicants must upload at application time
- `ApplicantDocument` — PDF document attached to an `Applicant`; `status`: `requested | uploaded`; `fileType` is one of the standard keys in `DOC_TYPES` (or `other` with a `requestLabel`); `uploadToken` (`@unique`) is the HMAC-signed public upload token; `tokenExpiresAt` is the token TTL; `uploadedBy` is either a Clerk `userId` (manager upload) or `'applicant'` (public upload)
- `Receipt` — photo/screenshot of a receipt; `status`: `PROCESSING | COMPLETED | FAILED`; `thumbnailUrl` points to a compressed WebP in UploadThing; `ocrMarkdown` holds raw Mistral OCR output; `extractedData` JSON holds structured `ExtractedReceiptData` (vendor, total, tax, items, etc.); `originalHash` SHA-256 of the original image (original discarded after processing); `transactionId` optional link to a `Transaction`; `Transaction` has a back-relation `receipts Receipt[]`

### UserPreference data (`src/types/preferences.ts`)

`UserPreference.data` is a Prisma `Json` column. All reads go through `parsePreferences(raw)` from `src/types/preferences.ts`, which returns a fully typed `UserPreferenceData` object — no inline `as Record<string, unknown>` casts anywhere in the codebase.

**Adding a new preference key:**
1. Add it to the `UserPreferenceData` interface in `src/types/preferences.ts`
2. Write it via the `POST /api/preferences` endpoint (shallow merge) or a dedicated route using the same `{ ...parsePreferences(existing?.data), newKey: value } as never` upsert pattern
3. Read it with `parsePreferences(prefs?.data).newKey` — no cast needed

`InvoiceDefaults` is also defined in `src/types/preferences.ts` (used by `invoiceDefaults` key).

### API Routes (`src/app/api/`)

Each resource has its own directory (e.g. `api/transactions/`, `api/rules/`). All routes:
- Are protected by Clerk middleware (`src/middleware.ts`)
- Extract `userId` via `auth()` from `@clerk/nextjs/server`
- Return responses via helpers in `src/lib/api-response.ts`: `ok()`, `created()`, `badRequest()`, `unauthorized()`, `notFound()`, `serverError()` — all return `{ data, error, meta? }`

**Estimate routes** (`api/projects/[id]/estimates/`):
- `GET / POST` — list / create estimates for a project (ownership via `workspaceId`)
- `GET / PATCH / DELETE [estId]` — get / update / delete a single estimate
- `POST [estId]/finalize` — set status to `FINAL` (locks editing; further edits must go through `/revise`)
- `POST [estId]/revise` — create a new version (`parentId` → prior estimate, prior status set to `SUPERSEDED`)
- `POST [estId]/duplicate` — copy an estimate as a new `DRAFT` (use as template)
- `POST [estId]/ai-assist` — chat-based AI estimation; `estId` can be `'new'` for unsaved estimates; returns **SSE** (`text/event-stream`) with the same `status / token / done / error` event shape as the invoice `ai-assist` route; uses `openrouterWithTools` for tool rounds then `openrouterStream` for the final streamed answer; tool: `lookup_similar_estimates`

**Quote routes** (`api/projects/[id]/quotes/`):
- `GET / POST` — list quotes for a project; `POST` triggers quote generation from an estimate ID
- `GET / PATCH / DELETE [quoteId]` — get / update / delete a quote
- `POST [quoteId]/send` — email PDF to client; sets `sentAt` / `sentTo`, status → `SENT`
- `POST [quoteId]/accept` — mark as `ACCEPTED`, records `signedAt`
- `POST [quoteId]/revise` — create a new quote version for negotiation (`previousVersionId` chain)
- `POST [quoteId]/amend` — create a post-acceptance amendment (`isAmendment: true`, `parentQuoteId` set)
- `POST [quoteId]/create-invoice` — generate an `Invoice` from the quote, sets `Invoice.quoteId`
- `GET [quoteId]/fulfillment` — compute agreed vs. invoiced vs. paid (query-time aggregation, not stored)
- `GET [quoteId]/pdf` — generate and stream the quote PDF

**Receipt routes** (`api/receipts/`):
- `POST upload` — full pipeline: Mistral OCR → Claude extraction → Sharp WebP compression → UploadThing upload → Prisma upsert; accepts `{ image: dataURI, transactionId? }`; all steps are `await`ed
- `GET /` — list all receipts for user, includes linked transaction
- `PATCH / DELETE [id]` — link/unlink transaction, delete receipt
- `POST [id]/retry` — re-run OCR+extraction on a FAILED receipt using its thumbnail URL

**Margin rule routes** (`api/margin-rules/`):
- `GET / POST` — list / create-or-update margin rules for the current user
- `DELETE [id]` — delete a margin rule

Agent routes (`api/agent/`) stream SSE responses using `ReadableStream` with `text/event-stream`. Events are typed: `{ type: 'status' | 'answer' | 'done' | 'error', ... }`.

### Rules Engine (`src/lib/rules/`)

- `engine.ts` — generic `evaluateRules<TFact, TResult>(fact, rules, strategy)` where `strategy` is `'first'` (stop on first match) or `'all'`
- `categorization.ts` — defines `TransactionFact` and `CategorizationResult` types
- `evaluate-condition.ts` — shared condition evaluation used by both `user-rules.ts` and `rules-tools.ts`; exports `getFieldValue`, `evaluateOperator`, `matchesConditions`, and `ConditionDef`; `matchesConditions` accepts `Parameters<typeof getFieldValue>[0]` as the transaction type so all supported fields (including `rawDescription`, `currency`, `notes`, `tags`) are covered
- `user-rules.ts` — `loadUserRules(userId)` loads `CategorizationRule` rows from DB and hydrates them into `Rule` objects; `buildCondition()` interprets the conditions JSON
- `categorize-batch.ts` — runs rules against an array of transactions during import

Rule condition fields: `description`, `payeeName`, `rawDescription`, `amount`, `currency`, `accountName`, `notes`, `tag`, `date`, `month`, `dayOfWeek`. Operators include `contains`, `not_contains`, `equals`, `not_equals`, `starts_with`, `ends_with`, `regex`, `gt`, `lt`, `gte`, `lte`, `in`/`oneOf`, `between`.

### LLM / Agent Integration (`src/lib/llm/`, `src/lib/agent/`)

`src/lib/llm/openrouter.ts` exposes three functions:
- `openrouterChat(messages, model?)` — simple text completion; default model `mistralai/devstral-small`
- `openrouterWithTools(messages, tools, model?)` — tool-calling with streaming SSE accumulation; default model `mistralai/mistral-small-2603`; streams to avoid serverless timeouts; retries up to 2× with exponential back-off (2s, 4s) on transient errors (429, 500, 502, 503, 504)
- `openrouterStream(messages, model, onToken)` — streaming completion without tools; calls `onToken(chunk)` for each content delta; returns the full accumulated text; used by `ai-assist` routes for the final answer pass after tool rounds complete

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

`src/lib/agent/rules-tools.ts` — tool set for the rules-generation agent. Key design points:

- **Self-learning**: in addition to uncategorised transactions, the agent fetches three extra sources via tool calls: `get_ruleless_patterns` (transactions the user already tagged but no rule covers), `get_project_transactions` (project-tagged transactions with no project-assignment rule), and `get_transfer_candidates` (same-day debit/credit pairs across different accounts — likely internal transfers). This lets the agent formalise manual work and detect structural patterns automatically.
- **Transfer detection**: `get_transfer_candidates` queries uncategorised transactions, groups by date, and finds debit/credit pairs across different accounts whose amounts match within a 2% tolerance (to catch cross-currency transfers with small fees). Pairs are surfaced to the LLM with description text from both sides so it can emit an "Account transfer" rule for each distinct pattern.
- **Workspace support**: `RulesContext` carries a `workspaceMap` (name.toLowerCase() → id); `emit_rule_suggestion` accepts an optional `workspaceName` which is validated against the map and stored on the suggestion. `CategorizationRule.workspaceId` is already applied by the rules engine.
- **TxSnapshot**: includes `workspaceId: string | null` and `tags: string[]` (fetched via `account.currency` for currency — currency lives on Account, not Transaction).
- **Project-assignment validation**: if a suggestion sets `workspaceName`, the validator checks that the matched transactions do not span multiple projects. If the condition is too broad (e.g. "description contains Zelle payment from" matching tenants from several properties), it is rejected with the conflicting project names listed — forcing the agent to use a more specific condition such as `payeeName equals X`.
- **Payee-condition exemptions**: the "already categorised > 40%" reclassification guard is skipped for rules whose only condition is `payeeName equals X` (precise selector) and for self-learning rules where all matched transactions already carry the same category (formalisation, not reclassification).
- The SSE endpoint (`api/agent/rules`) has a 30-second per-user cooldown stored in `UserPreference.data.lastRulesAgentRun`. **Lazy tool-call pattern**: the round-0 user message contains only a ~200-token snapshot; Sonnet calls all 8 data tools in parallel in round 0, then calls `record_plan` in round 1; Haiku emits suggestions in round 2+; Sonnet is re-invoked for cleanup if Haiku leaves unresolved rejections. `openrouterWithTools` retries transient errors (429/5xx) up to 2× with exponential backoff and aborts hung streams after 90s.
- **Background runner** (`src/lib/agent/run-rules-agent.ts`): `runRulesAgentInBackground(userId)` runs the same LLM loop but persists `RuleSuggestion` rows to DB instead of streaming SSE. Called fire-and-forget from `POST /api/transactions/import` after every CSV import — the user sees suggestions in the rules UI the next time they open it. Also stamps `lastRulesAgentRun` so the SSE cooldown is respected.
- `scripts/run-rules-agent.ts` — standalone `tsx` script for running the agent server-side for a given userId without a UI session; useful for admin inspection and testing.

### Document Request System (`src/lib/doc-types.ts`, `src/lib/doc-token.ts`, `src/lib/uploadthing.ts`)

Applicants can upload PDFs both inline at application time and via ad-hoc manager-requested links.

**Standard doc types** (`src/lib/doc-types.ts`): `proof_of_income`, `proof_of_residence`, `government_id`, `bank_statement`, `employment_letter`, `reference_letter`, `other`. Use `docTypeLabel(key, requestLabel?)` to get the display string.

**HMAC tokens** (`src/lib/doc-token.ts`): `generateDocToken(documentId)` → base64url `{documentId}:{expires}:{sig}` with 7-day TTL. `verifyDocToken(token)` → `{ documentId }` or `null`. Secret is `ENCRYPTION_SECRET`. Tokens are stored on `ApplicantDocument.uploadToken` and nulled out after use.

**Uploadthing** (`src/lib/uploadthing.ts`): two routes, both PDF-only, 16MB server limit (UI enforces 10MB):
- `applicantDocUploader` — used by the application form (public, no auth)
- `adHocDocUploader` — used by the ad-hoc upload page (public, no auth; token validation happens in the submit handler)

Uploadthing route handler at `src/app/api/uploadthing/route.ts`. Client helpers (`useUploadThing`, `uploadFiles`) exported from `src/lib/uploadthing-client.ts`.

**Flow — inline at application time:**
1. Manager configures `Listing.requiredDocs` (array of doc-type keys) in the listing create form
2. Application form (`src/components/public/application-form-client.tsx`) shows a Documents step when `listing.requiredDocs.length > 0`
3. Each doc uploads to Uploadthing immediately via `applicantDocUploader`; the resulting URL is included in the submission payload as `uploadedDocs[]`
4. `POST /api/public/applications` saves each entry as an `ApplicantDocument` row (`status: 'uploaded'`)

**Flow — ad-hoc manager request:**
1. Manager opens applicant detail → clicks "+ Request docs" → selects doc types → clicks "Send request"
2. `POST /api/projects/[id]/applicants/[applicantId]/request-docs` creates `ApplicantDocument` rows (`status: 'requested'`), generates HMAC tokens, and emails one Resend email with all upload links
3. Applicant clicks link → `/apply/docs/[token]` page → `DocUploadClient` fetches metadata via `GET /api/public/docs?token=...`, uploads PDF via `adHocDocUploader`, then `POST /api/public/docs` saves the URL and consumes the token
4. Applicant detail sidebar refreshes and shows the doc with `Uploaded` badge and a View link

### Open Banking providers (`src/lib/bank-providers/`)

Primary bank sync uses real Open Banking APIs routed by institution country:

- **US** → Plaid (`src/lib/bank-providers/plaid.ts`) — cursor-based incremental sync via `transactionsSync`; public-token exchange via PlaidLink widget
- **UK** → Finexer (`src/lib/bank-providers/finexer.ts`) — UK Open Banking (99% coverage); OAuth redirect to `/connect/callback`; date-range sync against `/open-banking/v3.1/aisp/`
- **EU** → Enable Banking (`src/lib/bank-providers/enable-banking.ts`) — PSD2/Berlin Group (2,500+ banks, 29 countries); OAuth redirect; date-range sync against `/v2/accounts/`

All three implement `BankProviderAdapter` (`src/types/bank-providers.ts`) and feed into the shared `importNormalizedTransactions` pipeline (`src/lib/bank-providers/sync-engine.ts`).

**OAuth callback flow (Finexer + Enable Banking):**
1. `POST /api/connections/init` builds the provider auth URL (with encrypted `state` = `{accountId, userId}`) and returns it
2. `connect-bank-dialog.tsx` redirects `window.location.href` to the provider
3. Provider redirects back to `/api/connections/finexer/callback` or `/api/connections/enable-banking/callback` (GET) with `?code=&state=`
4. Callback decrypts state, exchanges code for tokens, encrypts and stores them, runs initial 90-day sync, redirects to `/connect/callback` (the UI landing page)
5. `/connect/callback` (Next.js page) reads result query params and shows success/warning/error

**Webhook routes:**
- `POST /api/webhooks/plaid` — `TRANSACTIONS.SYNC_UPDATES_AVAILABLE` triggers incremental sync
- `POST /api/webhooks/finexer` — `transactions.updated`, `consent.revoked`, `consent.expired`
- `POST /api/webhooks/enable-banking` — `transactions.available`, `session.expired`, `session.revoked`

**Scheduled sync** (`POST /api/sync/scheduled`) — runs every 6h; covers `PLAID | FINEXER | ENABLE_BANKING` connections with stale `lastSyncAt`.

**Token storage:** access tokens encrypted with AES-256-GCM (`src/lib/bank-agent/crypto.ts`). Finexer and Enable Banking also store a refresh token (`refreshCiphertext/Iv/AuthTag`) and `tokenExpiresAt`.

### Browser Agent fallback (`src/lib/bank-agent/`, `src/app/api/bank-agent/`)

Fallback for institutions not covered by the Open Banking providers. Uses `playwright-core` (NOT `playwright`) connecting to Browserless.io via WebSocket CDP.

- `src/lib/bank-agent/worker.ts` — LLM-guided login + CSV discovery; saves `BankPlaybook` + `EncryptedCredential`
- `src/lib/bank-agent/crypto.ts` — AES-256-GCM; key = `sha256(ENCRYPTION_SECRET + userId)`
- `src/types/bank-agent.ts` — `PlaybookStep`, `PageElement`, `SyncJobEvent`

API routes (SSE-streaming):
- `POST /api/bank-agent/connect` — first-time LLM-guided setup
- `POST /api/bank-agent/sync` — replay saved playbook
- `GET /api/bank-agent/status?accountId=X`
- `POST /api/bank-agent/disconnect`

**Never log credentials** — username/password must never appear in `console.log`.

### Estimate → Quote → Invoice Pipeline

**Pages:**
- `/projects/[slug]/estimates` — all estimates for a project (list view)
- `/projects/[slug]/estimates/new` — new estimate editor (project-level, no job required)
- `/projects/[slug]/estimates/[estId]` — existing estimate editor (view/edit)
- `/projects/[slug]/quotes` — quote list for a project
- `/projects/[slug]/quotes/[quoteId]` — quote detail with status, fulfillment bar, version/amendment history
- `/projects/[slug]/quotes/[quoteId]/generate` — side-by-side quote generator

**Components:**
- `estimate-editor.tsx` — table-based editor (real `<table>` element, not CSS grid) with sections/items, internal notes, cost calculation, AI chat assist, finalize/revise/duplicate actions; receives `projectId` (DB id for API calls) and `projectSlug` (for client-side redirect after create); no `jobId` prop — estimates are project-scoped
- `estimate-list.tsx` — list of estimates for a project with status badges, duplicate button, and inline job picker that appears when generating a quote from a FINAL estimate
- `quote-generator.tsx` — side-by-side estimate↔quote review; margin sliders, group toggles, optional item toggles, scope editing. **Collapse/expand state:** `expandedSections` is initialised by inspecting the saved quote (>1 item or single item description ≠ section name = expanded). Collapsing only sums non-optional items; optional sourceItemIds are stashed in the collapsed item's `unit` field as `JSON.stringify({ optionalIds: [...] })` so re-expanding restores optional state. The collapsed row is always `isOptional: false`. The API (`POST quotes`) also always creates collapsed rows with `isOptional: false`.
- `quote-detail-client.tsx` — quote view with fulfillment bar, version chain, amendment list
- `quote-list.tsx` — quote list per project
- `send-quote-modal.tsx` — email + PDF send flow, mirrors `send-invoice-modal.tsx`
- `src/lib/pdf/quote-pdf.tsx` — react-pdf/renderer quote PDF (same pattern as `invoice-pdf.ts`)
- `src/components/settings/margin-rules-editor.tsx` — settings UI for default margin rules per tag
- `src/stores/quote-generator-store.ts` — Zustand store for quote generator session state (margins, grouping, scope edits, optional toggles)

**Key design rules:**
- `costRate` and `internalNotes` on `EstimateItem` are **never** included in quote or invoice output
- Estimates belong to a `Workspace` (project) — `jobId` on `Estimate` is optional/legacy. The job binding happens at `Quote` creation time, not when the estimate is written
- `POST /api/projects/[id]/quotes` requires both `estimateId` and `jobId` in the body — the UI shows an inline job picker on the estimate list when "Generate Quote" is clicked
- Quote generation collapses estimate sections to single `QuoteLineItem` rows by default; user can expand per section
- `Quote.overrides` JSON preserves human decisions (margins, grouping, scope edits) across regenerations when the estimate changes
- AI assist on estimates uses `openrouterWithTools` with a `lookup_similar_estimates` tool that queries by `workspaceId`; works with `estId='new'` for unsaved estimates
- Estimate AI item fields: `hours` = effort **per unit**, `costRate` = cost **per hour**, `quantity` = number of units, `unit` = label for what's being counted (e.g. "eps", "days") — `unit` is never "hrs"
- Fulfillment (`GET /fulfillment`) is computed at query time from linked invoices and payments — nothing extra is stored
- Invoices created from quotes set `Invoice.quoteId`; invoices created directly leave it null — both paths are valid

### Invoice Detail Layout (`src/components/projects/invoice-detail-client.tsx`)

Compact layout designed to fit without scrolling:
- **Edit button** shown only for `DRAFT` invoices (not for SENT/PARTIAL/OVERDUE)
- **Action buttons** split into 2 rows: row 1 = invoice actions (Edit, Renegotiate, Delete, Send, Mark as sent); row 2 = PDF/void (Preview PDF, Download PDF, Void)
- **PDF preview** opens in a modal iframe overlay (not a new tab) — same blob+`createObjectURL` pattern as the settings page; click outside or × to close
- Payment info and Payments table sit side by side in a `grid-cols-2`, **below** the action button rows
- Payments table container has no `overflow-hidden` — required so the `...` dropdown menu is not clipped
- Each payment row has a three-dot SVG menu with **Remove** (DELETE) and **Move to invoice…** (PATCH) actions
- The `...` menu registers its close listener via `setTimeout(0)` so the opening click does not immediately re-fire the document listener and close the menu

### Client Hub (`/studio`, `src/app/studio/page.tsx`, `src/components/studio/studio-client.tsx`)

Server component (`page.tsx`) fetches all active CLIENT workspaces with their invoices, jobs, and quotes (status `ACCEPTED` or `SENT`). Quotes include `_count.invoices` so the client can tell whether an accepted quote has already been invoiced.

`StudioClient` is the client component. Key layout from top to bottom:

0. **Overhead workspace banner** — shown above everything when `hasOverheadWorkspace` is `false` (i.e. no `Workspace` with `isDefault: true` exists for the user). Clicking "Set up →" POSTs directly to `POST /api/projects` with `{ name: 'Business Overhead', type: 'OTHER', isDefault: true }` and calls `router.refresh()` — no navigation. The banner disappears once the server re-queries and finds the new workspace. `hasOverheadWorkspace` is computed in `studio/page.tsx` via `prisma.workspace.findFirst({ where: { userId, isDefault: true } })`.

1. **Unified KPI + pipeline row** — single 6-cell grid: Quotes accepted | Invoices Outstanding | Invoices Overdue | Invoices Collected Past 30 Days | Invoices Collected since start of Year (YTD) | Clients.
   - **Outstanding** counts only `SENT | PARTIAL | OVERDUE` invoices (DRAFTs excluded)
   - **Outstanding** and **Overdue** are clickable: set `clientFilter` state, auto-expand the first matching client card, and scroll to the cards section
   - **Collected Past 30 Days** is also clickable: filters to paid invoices within the last 30 days (computed client-side from flat invoice data)
   - YTD figure counts all paid invoices since Jan 1 of the current year

2. **3-column strip** — `gridTemplateColumns: 'auto 1fr 1fr'`:
   - **Take action** — 2-column pill grid: col 1 = New client, New job, Log time; col 2 = Draft invoice, New quote, New estimate. **Hidden when `clientFilter` is active** (KPI click or Take Notice click) — the invoice/quote list takes full width for easier scanning.
   - **Take notice** — smart banners derived from `notices` useMemo. Invoice banners: overdue, unsent drafts. Quote banners: awaiting acceptance (SENT quotes), accepted but not yet invoiced (ACCEPTED quotes with `hasInvoice: false`). Invoice banners click to set `clientFilter` ('overdue' or 'unsent') and scroll to client cards. Quote banners navigate to the first affected project's quotes page. Active filter highlighted.
   - **Recent activity** — top-6 invoice events sorted by date desc.

3. **Client cards** — expandable accordion per client. `clientFilter` state ('outstanding' | 'overdue' | 'unsent' | 'collected' | null) is combined with `clientSearch` to filter the list. Filter pill shows above cards; clicking ✕ clears the filter. Each client card header shows the same 5 KPIs as the header row (Quotes accepted, Outstanding, Overdue, Collected Past 30 Days, Collected since Jan 1).

**Data shapes passed to `StudioClient`:**
- `client.acceptedQuotes` — `{ id, quoteNumber, title, totalQuoted, currency, hasInvoice }` (ACCEPTED only)
- `client.sentQuotes` — `{ id, quoteNumber, title, totalQuoted, currency, sentAt }` (SENT only)

### Transaction Table & Rules UI (`src/components/transactions/transaction-table.tsx`)

- **Make-rule inline prompt** — after the user finishes editing a row and moves away, a compact 💡 "Make rule / ✕" prompt appears in the last `<td>` of that row (where "Done" was). Clicking "Make rule" inserts a full-width `<tr>` directly below the edited row containing `RuleEditor`, pre-filled from the edit. The prompt persists until dismissed or the page reloads — no auto-dismiss timer. Rows are wrapped in `React.Fragment` (keyed) to allow the sibling sub-row. No `position: fixed` or `getBoundingClientRect` involved.
- **Toolbar modals** — "Create rule" and "Run rules agent" are buttons in the toolbar that open inline modals (no page navigation); "Create rule" reuses `RuleEditor`; "Run rules agent" embeds `RulesAgent` in a scrollable modal

### Chat Overlay (`src/components/chat/chat-overlay.tsx`)

Single icon pill always visible — Sparkles icon by default, expands to show "chat to ai" text on hover via `max-w-0 → max-w` CSS transition. No hidden/show/minimize states; no separate hide button.

### CSV Import Flow

1. Upload (`/upload`, `api/upload/`) — parse CSV client-side via `src/components/upload/csv-dropzone.tsx`; store in Zustand (`src/stores/upload-store.ts`)
2. Column mapping (`src/components/upload/column-mapper.tsx`) — LLM validates/maps headers via `api/llm/validate-mapping/`
3. Import preview (`src/components/upload/import-preview.tsx`) — apply institution schema
4. Final import (`api/transactions/import/`) — dedup via `src/lib/dedup.ts` (`buildDuplicateHash`), then batch-categorize, insert transactions and update `ImportBatch`; after returning the response, fires `runRulesAgentInBackground(userId)` as a fire-and-forget to generate rule suggestions automatically

### Dashboard Widgets (`src/components/widgets/`, `src/lib/widgets/`)

Each widget fetches from a dedicated `api/widgets/` endpoint (`cashflow`, `categories`, `networth`, `data`). Widgets use a relative date range picker (`RelativeDateRangePicker.tsx`) where the applied range is stored separately from in-progress selection. Chart rendering is handled by `ChartRouter.tsx` which dispatches to `AreaChartWidget`, `BarChartWidget`, `DonutChartWidget`, or `LineChartWidget`.

Widget data pipeline: `src/lib/widgets/data-fetcher.ts` → `data-transformer.ts` → component. Colors: `src/lib/widgets/colors.ts`. Date helpers: `src/lib/widgets/date-utils.ts`.

All widget API routes accept a `?currency=USD|EUR|GBP` query param (or `currency` field in POST body for `/api/widgets/data`). Amounts are converted at the transaction's own month's rate before aggregation.

### Dashboard Currency Picker

The dashboard header contains a USD/EUR/GBP pill picker (`src/components/dashboard/dashboard-header.tsx`). Selection is held in `DashboardClient` (`src/components/dashboard/dashboard-client.tsx`) and immediately persisted to `UserPreference.data.dashboardCurrency` via `POST /api/preferences`. On first visit the default is detected from the user's earliest `Account.currency`.

**FX conversion** (`src/lib/fx.ts`):
- `getRate(from, to, 'YYYY-MM')` — looks up EUR-base cross-rate for the given month; falls back to the most recent available row (carry-forward)
- `convertAmounts(rows, targetCurrency)` — batch conversion with in-process caching; all widget routes and `data-fetcher.ts` use this
- `POST /api/fx-rates/refresh` — fetches latest ECB rates from `api.frankfurter.app` and upserts the current month's `FxRate` row
- Seed script: `npx tsx scripts/seed-fx-rates.ts` — populates the full 2000–present history (642 rows, EUR/USD + EUR/GBP)

### Client State

Zustand stores in `src/stores/`:
- `upload-store.ts` — CSV import multi-step flow state
- `chat-store.ts` — AI chat overlay state + conversation memory (`sessionId`, `turns`, `addTurn`, `clearHistory`); also has `openWithMessage(msg)` / `pendingMessage` for pre-loading a query into the global chat overlay

### New Invoice Shortcuts (`src/components/projects/new-invoice-shortcuts.tsx`)

Rendered above `InvoiceEditor` wherever a new invoice can be created — the dedicated `/invoices/new` page **and** the Studio invoice modal. Three quick-create actions:
- **From accepted quote** — dropdown of ACCEPTED quotes; on select + confirm calls `POST /api/projects/[id]/quotes/[quoteId]/create-invoice` and redirects
- **From transactions** — writes prompt to `sessionStorage('invoice-ai-prompt')` and fires `CustomEvent('invoice-ai-trigger')`; `InvoiceEditor` listens and auto-submits to its own AI chat panel
- **Start from past invoice** — writes to `sessionStorage('invoice-open-copy-picker')` and fires `CustomEvent('invoice-copy-picker-trigger')`; `InvoiceEditor` opens the copy picker

`InvoiceEditor` checks `sessionStorage` on mount AND listens for the custom events (in case components mount in different order).

**Accepted quotes data flow**: callers must fetch ACCEPTED quotes server-side and pass them as `acceptedQuotes` prop. In `StudioPage`, quotes are fetched in the same Prisma query as the project and threaded through `StudioClient → StudioInvoiceModal → NewInvoiceShortcuts`. Projects created on-the-fly in the modal default to `acceptedQuotes: []`.

Server data fetching uses standard Next.js patterns (server components + `fetch` in client components). Shared types live in `src/types/index.ts` and `src/types/widgets.ts`.

## Known Gotchas

### Neon client timezone mangling for `timestamptz`

`@neondatabase/serverless` serialises `timestamptz` columns using the Neon server's local timezone (UTC+1 in production) when converting to ISO strings. JS `Date` objects built from those strings have an epoch 1 hour behind the stored value. Calling `getUTCFullYear/Month/Date` on them returns the wrong day for rows near midnight UTC.

**Fix**: avoid JS `Date` math on `timestamptz` columns. Instead, use a `$queryRaw` with `to_char(col AT TIME ZONE 'UTC', 'YYYY-MM-DD')` so Postgres formats the date before it touches the JS layer. See `src/app/api/pivot/route.ts`.

Similarly, the CSV processor (`src/lib/csv-processor.ts`) must strip bare datetime strings (e.g. `"2025-01-01T00:00:00"`) down to `YYYY-MM-DD` before passing them to `new Date()` — bare datetime strings without a timezone suffix are parsed as local time by V8, which on a UTC+1 server stores them 1 hour early.

### Prisma v7 generated client path

Prisma 7 (`prisma-client` generator) outputs to `src/generated/prisma/` **without** an `index.ts`. The entry point is `client.ts`. All imports must use:

```ts
import { PrismaClient } from '@/generated/prisma/client'
// NOT: '@/generated/prisma'  ← breaks in v7
```

`src/generated/` is gitignored. On deploy, the build step runs `prisma generate` automatically (see `package.json` build script). Locally, run it manually with `DIRECT_URL` prefixed (see Commands above).

### Prisma adapter — PrismaNeon (WebSocket)

The project uses `@prisma/adapter-neon` (`PrismaNeon`) with `@neondatabase/serverless` — WebSocket transport. This supports Prisma interactive transactions (`$transaction`) and batch transactions, unlike `PrismaNeonHttp` which only supports HTTP and does **not** support transactions at all.

```ts
import { PrismaNeon } from '@prisma/adapter-neon'
const adapter = new PrismaNeon({ connectionString })
```

Do **not** use `PrismaNeonHttp`, `PrismaPg`, or `@prisma/adapter-pg` — `PrismaNeonHttp` breaks on any `$transaction` call (including Prisma nested writes), and `pg`/`adapter-pg` are not installed.

### Job model has no `isActive` field

`Job` uses a `status` enum (`JobStatus`: `ACTIVE`, `COMPLETED`, `CANCELLED`). Filter active jobs with `{ status: 'ACTIVE' }`, not `{ isActive: true }`.

### Invoice and estimate AI chat — shared SSE pattern

Both `ai-assist` routes (invoice and estimate) return **SSE** (`text/event-stream`) with the same four event types:
- `{ type: "status", text: "..." }` — emitted at the start and during tool calls (e.g. "Thinking…", "Looking up similar estimates…", "Building estimate…")
- `{ type: "token", text: "..." }` — carries the **full extracted text so far** (not a delta) as the final answer streams in; client sets message text to this value directly
- `{ type: "done", text: "...", actions: [...] }` — final clean text + parsed actions array; client applies actions on this event
- `{ type: "error", text: "..." }` — on failure

**Invoice `ai-assist`** (`api/projects/[id]/invoices/ai-assist/route.ts`): tool rounds via `openrouterWithTools` (non-streaming), final answer via `streamFinalAnswer` (internal helper that streams directly). Round 0 uses `forwardTokens: false` — raw JSON is never forwarded to the client; only the parsed `text` field reaches the user via the `done` event.

**Estimate `ai-assist`** (`api/projects/[id]/estimates/[estId]/ai-assist/route.ts`): same shape. Tool rounds via `openrouterWithTools`; final answer via `openrouterStream` with `extractStreamingText` called on each token to progressively extract the visible text. `estId` can be `'new'` for unsaved estimates.

**`extractStreamingText(raw)`** — shared char-by-char walker (duplicated in both route files) that locates the `"text"` key in a partially-streamed JSON string and extracts its value, correctly handling escape sequences and embedded quotes. Avoids the regex approach which terminates early on unescaped quotes inside the text value.

**`ai-finalize`** (invoice only) — separate non-streaming route; calls `openrouterChat()` and returns a plain JSON response `{ suggestedNotes, questions }`. Strips markdown fences and falls back to the first `{...}` block.

**Client SSE reader pattern** (both `invoice-editor.tsx` and `estimate-editor.tsx`):
- Append user message + assistant placeholder in a **single** `setChatMessages` call to avoid stale-index issues under React 18 automatic batching
- `status` → update placeholder to italic status text
- `token` → set placeholder text to the full extracted text so far
- `done` → set final text, apply actions
- `error` → set error text

### `isTaxLine` on `InvoiceLineItem`

Tax is stored as a regular line item with `isTaxLine: true`. This avoids a separate model. When serializing invoices from server components, always include `isTaxLine` in the mapped output so client components can distinguish tax lines from regular ones.

### React Rules of Hooks in client components

All `useState` and `useReducer` calls must be declared at the top level of the component function — never inside helper functions, shims, or conditional branches. The linter enforces `react-hooks/rules-of-hooks`.

### Background work after response

On Fly.io the Node process persists, so fire-and-forget patterns work. However, `await Promise.allSettled([...])` is still preferred for critical work (invoice matching via `matchInvoicePayments`, tenant matching via `matchTenantPayments`) to ensure errors are caught and logged.

### Invoice renegotiation flow

`POST /api/projects/[id]/invoices/[invoiceId]/renegotiate` voids the original invoice and creates a replacement DRAFT in a single `$transaction`. Guards: status must be `SENT | PARTIAL | OVERDUE` and `replacedBy` must be null. The replacement carries `replacesInvoiceId` pointing back to the voided original. If `totalPaid > 0` a credit line item with negative `unitPrice` is prepended to the replacement.

### Uploadthing `maxFileSize` must be a power-of-2 string

Valid values are `"1MB"`, `"2MB"`, `"4MB"`, `"8MB"`, `"16MB"`, etc. `"10MB"` is not accepted and will cause a TypeScript build error. The UI enforces 10MB client-side; the server limit is set to `"16MB"` to accommodate that.

### Document upload token is single-use

`ApplicantDocument.uploadToken` is nulled out after a successful upload (`POST /api/public/docs`). A second attempt with the same token returns `400 Invalid token`. This is intentional.

### Invoice number format

Invoice numbers are generated as `{INITIALS}_{DDMMYYYY}_{SEQ}` — e.g. `AMC_04112026_01`. Initials come from `UserPreference.data.businessName` (preferred) or `yourName`, falling back to `INV` if neither is set. Each whitespace-separated word contributes its first uppercase letter. Sequence is a 2-digit zero-padded count of the user's existing invoices + 1. Both the create route (`POST api/projects/[id]/invoices`) and renegotiate route use this logic. The settings preview invoice (`POST /api/settings/preview-invoice`) also uses it so the number shown in the preview matches real invoices.

### PDF generation

`GET /api/projects/[id]/invoices/[invoiceId]/pdf` generates a PDF via `generateInvoicePdf` (react-pdf/renderer, `src/lib/pdf/invoice-pdf.tsx`). The response must wrap the buffer in `new Uint8Array(pdfBuffer)` — passing a `Buffer` directly fails TypeScript (`Buffer` is not assignable to `BodyInit`). `PdfInvoice` includes sender fields (`fromEmail`, `fromPhone`, `fromAddress`, `fromVatNumber`, `fromWebsite`) read from `UserPreference.data` at PDF generation time.

### Fly.io — build-time vs runtime env vars

`NEXT_PUBLIC_*` variables are baked into the JS bundle at build time. They are set as `[build.args]` in `fly.toml`. Runtime secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`, etc.) are set via `fly secrets set` and injected at runtime — never in the Docker image.

If you add a new `NEXT_PUBLIC_*` variable, add it to both:
1. `fly.toml` under `[build.args]`
2. The `ARG` / `ENV` declarations in the Dockerfile builder stage

### Fly.io — Prisma adapter uses pooled DATABASE_URL

`DATABASE_URL` should be the **pooled** Neon connection string (has `-pooler` in hostname) — used by the running app. `DIRECT_URL` (non-pooled, no `-pooler`) is used only by Prisma CLI commands (`db:push`, `prisma generate`). The split is configured in `prisma.config.ts` which prefers `DIRECT_URL` when set.

### Fly.io — GitHub Actions deploy requires a repository secret

The deploy workflow (`.github/workflows/deploy.yml`) reads `FLY_API_TOKEN` from GitHub secrets. It must be stored as a **repository secret**, not an environment secret — environment secrets are scoped to a named environment and won't be injected into workflows that don't declare `environment:`. Generate the token with `fly tokens create deploy -a backoffice-ai` and save it at `https://github.com/takingbackfunday/backoffice-ai/settings/secrets/actions`.

### Fly.io — `prisma generate` during local build needs DIRECT_URL

`pnpm build` runs `prisma generate` first. `prisma.config.ts` calls `env('DIRECT_URL')` which throws if the variable is absent (even with a `?? env('DATABASE_URL')` fallback — the `env()` helper throws rather than returning null). If neither URL is in `.env.local`, pass a dummy value to unblock local builds:

```bash
DIRECT_URL="postgresql://x:x@localhost/x" pnpm build
```

Or just run `prisma generate` separately before `next build`.

### Schema drift — db:push before deploying new models

If a Prisma model or enum value is added locally but `db:push` is not run against Neon before deploying, the running app will crash with Prisma error `P2022: The column does not exist`. Always run `db:push` before or immediately after pushing schema changes.

When dropping or renaming an enum value that may already have rows in prod, you must migrate existing rows first — `db:push` will refuse if live data uses the old value. Approach:

1. Ask the user to provide the `DIRECT_URL` (non-pooled Neon connection string, available from the Neon dashboard). Note: it should be rotated before onboarding real users.
2. Add the new enum values to the DB first via raw SQL (using `@neondatabase/serverless`):
   ```js
   sql`ALTER TYPE "EnumName" ADD VALUE IF NOT EXISTS 'NEW_VALUE'`
   ```
3. Migrate existing rows to the new value.
4. Run `npx prisma db push --accept-data-loss` with `DIRECT_URL` set.

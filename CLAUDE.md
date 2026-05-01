# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For architecture, data model, API routes, components, and feature entry points — see `codebase_map.md`.

## Git Workflow

**Commit without pushing** during development. Never run `git push` unless the user explicitly asks. Pushing to `main` triggers a Fly.io deploy via GitHub Actions. To deploy manually without pushing: `fly deploy`.

**After pushing**, verify the deploy succeeded:
```bash
gh run list --repo takingbackfunday/backoffice-ai --limit 3
```
The top entry should show `completed / success`. Do not use `fly logs` — it streams indefinitely and blocks.

## Database Access

Use Neon PostgreSQL directly (via `DIRECT_URL`). **Never use BigQuery** — this project does not use BigQuery.

`psql` is not available. Use Node with `@neondatabase/serverless` instead:

```bash
node << 'EOF'
const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:...');
(async () => {
  const rows = await sql`SELECT id, name FROM "Project" WHERE ...`;
  console.log(JSON.stringify(rows, null, 2));
})();
EOF
```

- **Always use a heredoc (`<< 'EOF'`)** — single-quoted heredocs prevent `$` expansion in regex patterns or template literals
- **`RETURNING` clauses return `[]`** — Neon serverless silently drops returned rows from `DELETE … RETURNING`. Run a `SELECT` first to confirm, then delete
- **FK constraints** — check `information_schema.table_constraints` and delete child records before parent

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

**DB CLI commands require `DIRECT_URL` (non-pooled connection):**
```bash
DIRECT_URL="<direct-connection-string>" pnpm db:push
DIRECT_URL="<direct-connection-string>" pnpm prisma generate
```

Prisma CLI does not read `.env.local`. `DIRECT_URL` must be the non-pooled Neon string (no `-pooler` in hostname). `DATABASE_URL` (pooled) is used by the running app.

There are no automated tests in this project.

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` — Neon PostgreSQL pooled connection string
- `DIRECT_URL` — Neon PostgreSQL **non-pooled** string (no `-pooler`); Prisma CLI only
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk auth
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`
- `OPENROUTER_API_KEY` — for AI features
- `ENCRYPTION_SECRET` — AES-256 key derivation + HMAC secret for doc upload tokens
- `UPLOADTHING_TOKEN` — file storage
- `MISTRAL_API_KEY` — receipt OCR (`mistral-ocr-latest`)
- `PLAID_CLIENT_ID`, `PLAID_SECRET` — US bank sync; `PLAID_ENV`: `sandbox | development | production`
- `FINEXER_CLIENT_ID`, `FINEXER_CLIENT_SECRET` — UK bank sync
- `ENABLE_BANKING_CLIENT_ID`, `ENABLE_BANKING_CLIENT_SECRET` — EU bank sync (29 countries)
- `BROWSERLESS_TOKEN` — cloud browser sessions (bank-agent fallback only)
- `RESEND_API_KEY` — transactional email; optional, skipped gracefully if absent
- `RESEND_FROM` — sender address (defaults to `Backoffice <noreply@backoffice.cv>`)
- `NEXT_PUBLIC_APP_URL` — public base URL for email links (defaults to `https://backoffice.cv`)

## Known Gotchas

### Prisma v7 import path
Entry point is `client.ts`, not `index.ts`:
```ts
import { PrismaClient } from '@/generated/prisma/client'
// NOT: '@/generated/prisma'
```

### Prisma adapter — use PrismaNeon, never PrismaNeonHttp
`PrismaNeon` (WebSocket) supports `$transaction`. `PrismaNeonHttp` does not — it breaks on any `$transaction` call including nested writes. `pg`/`adapter-pg` are not installed.

### Neon timezone mangling for `timestamptz`
Neon serialises `timestamptz` in UTC+1 in production. JS `Date` from those strings is 1 hour off. Use `$queryRaw` with `to_char(col AT TIME ZONE 'UTC', 'YYYY-MM-DD')` instead of JS Date math. Similarly, strip bare datetime strings to `YYYY-MM-DD` before `new Date()` in `csv-processor.ts`.

### Job model — no `isActive` field
Use `{ status: 'ACTIVE' }`, not `{ isActive: true }`.

### Schema drift — db:push before deploying new models
New Prisma models/enum values must be pushed to Neon before deploying or the app crashes with `P2022`. When dropping/renaming an enum value with live data: add new values via raw SQL first, migrate rows, then run `db:push --accept-data-loss`.

### Fly.io — NEXT_PUBLIC_* vars are build-time
Add to both `fly.toml` `[build.args]` and the Dockerfile `ARG`/`ENV` declarations.

### Fly.io — prisma generate needs DIRECT_URL
`pnpm build` runs `prisma generate` first. If `DIRECT_URL` is absent, pass a dummy value:
```bash
DIRECT_URL="postgresql://x:x@localhost/x" pnpm build
```

### Fly.io — GitHub Actions deploy token
Store `FLY_API_TOKEN` as a **repository secret** (not environment secret) at `Settings → Secrets → Actions`.

### Uploadthing maxFileSize must be power-of-2
Valid: `"1MB"`, `"2MB"`, `"4MB"`, `"8MB"`, `"16MB"`. `"10MB"` causes a TypeScript build error.

### Invoice SSE pattern — token events carry full text, not delta
`token` events contain the full extracted text so far. Client sets message text directly, not appends.

### isTaxLine on InvoiceLineItem
Tax is a regular `InvoiceLineItem` with `isTaxLine: true`. Always include `isTaxLine` when serializing invoices from server components.

### Document upload token is single-use
`ApplicantDocument.uploadToken` is nulled after upload. A second attempt returns `400 Invalid token`.

### Transaction — `projectId` vs `workspaceId` field name split
The DB column is `projectId` but Prisma maps it to `workspaceId` via `@map("projectId")`. Consequence:
- The `GET /api/transactions` query param is `projectId` (client-facing) — do not rename to `workspaceId` on the client.
- The `PATCH /api/transactions/[id]` body must use `workspaceId` (Prisma field) — sending `projectId` is silently ignored by the zod schema.
- The UI field name in `commitEdit` is `projectId`; map it to `workspaceId` before sending to the API.

### React Hooks — top-level only
`useState`/`useReducer` must be at the top level of component functions. The linter enforces `react-hooks/rules-of-hooks`.

### Invoice editor — description column uses `minmax`, not `1fr`
The line-items grid is `grid-cols-[minmax(120px,1fr)_140px_110px_100px_32px]`. The description column must use `minmax(120px,1fr)` — plain `1fr` collapses to zero when the AI sidebar constrains the form to `max-w-[60%]`, making descriptions invisible.

### Invoice notes and payment instructions — preference-scoped, not per-invoice
Two fields in `UserPreference.data` drive invoice defaults:
- `invoiceNotesDefault` — pre-fills "Notes / payment terms" in the editor. Deep-link: `/settings#invoice-notes-default`.
- `invoicePaymentNote` — pre-fills "Payment instructions". Deep-link: `/settings#payment-instructions`.

Both are shown read-only on the invoice detail view and in the PDF **only when non-empty** — no fallback text. The editor saves the current value back to preferences on `onBlur`. Neither field is stored on the `Invoice` record. `invoiceDefaults` no longer contains `notes` — that "remember last invoice notes" behaviour has been removed.

### WorkOrder — polymorphic context, exactly one FK
`WorkOrder` links to either a `Job` (CLIENT workspace) or a `MaintenanceRequest` (PROPERTY workspace) — never both, never neither. The `WorkOrderPanel` component receives a `context` prop: `{ type: 'job', jobId }` or `{ type: 'maintenance', maintenanceRequestId }`. Pass the correct one; the API accepts whichever is set.

Work orders created via `NewWorkOrderModal` (the global shortcut) may have both `jobId` and `maintenanceRequestId` as null if the user skips the context step — this is valid for workspace-level work orders.

### WorkOrder — vendor can be null; must be assigned before billing
`WorkOrder.vendorId` is nullable. A work order without a vendor will not appear on the vendor's detail page and blocks bill creation. The expanded panel in `WorkOrderPanel` always shows an inline vendor picker (with `+ New vendor…` inline creation) to assign one after the fact.

### Bill — vendorId is required and auto-inherited
`Bill.vendorId` is a required field. The bill creation UI (both `WorkOrderPanel` and `IntakeBillModal`) has **no vendor picker** — the work order's vendor is silently passed as `vendorId`. If the work order has no vendor, "Add bill" is blocked. Always pass `vendorId` equal to the work order's vendor when creating a bill via the API.

### Inline entity creation — `__new__` sentinel, local state only
All entity picker `<select>` elements in the modals (`NewWorkOrderModal`, `IntakeBillModal`) and `WorkOrderPanel` use a `__new__` sentinel value to trigger an inline mini-form. Pattern: `onChange` checks `value === '__new__'` → shows creation form; on success, appends to local state list and auto-selects. The server is never re-queried — newly created entities are only in local state until the next page load.

Maintenance request creation is intentionally absent from the modals — the API requires `unitId`, unavailable in modal context.

### Job detail — margin is server-computed
The Costs and Margin summary cards on the job detail page (`/projects/[slug]/jobs/[jobId]`) are calculated at server render time. `WorkOrderPanel` mutates its own local state after creating work orders/bills, but the summary cards don't update until the page is hard-reloaded. If you add live margin tracking, move the calculation into a client-side derived value from the panel's state.

### Transaction table — dropdowns must use portals
The table wrapper has `overflow-auto`, which clips absolutely-positioned dropdowns. Any new dropdown/popover inside `transaction-table.tsx` must render via `ReactDOM.createPortal` into `document.body`, positioned with `position: fixed` coords from `getBoundingClientRect`. Use the existing `useAnchorRect` hook in that file.

Portal elements have no `[data-row-id]` ancestor, so the row outside-click handler would exit row-edit when the user clicks a dropdown item. Add `data-portal-dropdown` to any new portal root element — the handler skips exit for clicks inside `[data-portal-dropdown]`.

### Pivot — aggregation dropdown is in PivotFieldBar, not PivotToolbar
The "Sum of Amount / Count / Average…" select lives in `src/components/pivot/pivot-field-bar.tsx` (between Report Filters and Sort). `PivotToolbar` owns view mode, subtotals, grand totals, no-decimals, presets, and export only. Don't add aggregation back to the toolbar.

### Pivot table — sticky column widths are measured, not fixed
`PivotTable` uses `useLayoutEffect` to read actual `offsetWidth` from header `<th>` elements and stores them as `stickyOffsets[]` for the `left` CSS property. Do not add `minWidth` to sticky cells — it would break the auto-fit measurement.

### CSV column mapper — AI confidence goes inside `<option>` text
The pattern throughout `column-mapper.tsx` is to embed confidence as a ` — X%` suffix directly in the option label (e.g. `Description — 95%`). There is no `ConfidenceBadge` component and no external "AI suggests" links. Follow this pattern for any new selects that receive LLM validation.

### Upload flow — no "done" page
The upload flow has two steps in the progress bar (`upload`, `map & import`). There is no "done" step rendered inline. When the import completes and `step === 'done'`, a shadcn `Dialog` modal appears over the page with "Import complete!" copy. The OK button resets the store and navigates to `/transactions`. For the onboarding path it also POSTs to `/api/preferences` first.

### Make-rule snap — always merge, never overwrite
`pendingRuleSnapRef.current` in `transaction-table.tsx` is written on every `commitEdit` for category/payee fields. Each write **merges** with the previous snap for the same row (`payeeName ?? prevSnap?.payeeName`, etc.) so that editing both fields in any order preserves both values. Overwriting directly loses whichever field was committed first when React's state update from the first commit hasn't propagated to the closure yet.

### Rules live preview — loadAll needs AbortController
`runPreview` has a 10-second `AbortController` timeout. `loadAll` (the "+ N more" button handler) must also use an `AbortController` with the same timeout — without it the button sticks at "Loading…" if the request hangs (Fly idle wake-up, slow Neon query).

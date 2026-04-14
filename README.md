# Backoffice AI

Financial management tool for freelancers, consultants, and small property managers.

## Features

### Transactions & Categorisation
- Import bank transactions via CSV upload or automated bank sync (Open Banking APIs)
- Duplicate detection via SHA-256 hash over `(account, date, amount, description)`
- Auto-categorise at import using a priority-ordered rules engine (regex, amount ranges, payee match, etc.)
- AI rules agent suggests new rules based on transaction edits; "Run rules agent" and "Create rule" open inline modals from the transactions toolbar (no page navigation)
- Make-rule popup anchors to the edited transaction row
- Pivot table view for cross-category analysis

### Projects (CLIENT)
- Client projects with jobs, invoices, and payment tracking
- **Estimate → Quote → Invoice pipeline** — full lifecycle from internal costing to client commitment to payment collection
- **Estimates**: internal costing tool scoped to the project (not a job); sections and line items with hours, cost rate, quantity, and unit fields; AI-assisted estimation via chat; finalize to lock; revise to create a new version; duplicate as template
- **Quotes**: client-facing quotes generated from estimates; job is selected at quote generation time (not locked to the estimate); margin rules applied per tag; side-by-side quote generator with margin sliders, grouping toggles, and inline scope editing; versioning and amendment flows; send by email with PDF attachment; quote acceptance tracking
- **Fulfillment tracking**: quotes link to invoices via `quoteId`; fulfillment bar shows agreed vs. invoiced vs. paid; uninvoiced balance computed at query time
- **Margin rules**: user-configurable default margins per work tag (design, dev, pm, etc.) applied automatically during quote generation
- **Client Hub dashboard** (`/studio`): single unified 6-cell KPI+pipeline row (Quotes accepted | Outstanding | Overdue | Collected | Earned this month | Clients); Outstanding and Overdue cells clickable to filter+expand matching client cards; 3-column panel: Take action 2×3 grid (New client, New job, Log time | Draft invoice, New quote, New estimate) | Take notice smart banners | Recent activity feed; Take notice surfaces invoice alerts (overdue, unsent drafts) and quote alerts (awaiting acceptance, accepted but not yet invoiced) — each banner is clickable: invoice ones filter the client cards section, quote ones navigate to the relevant project's quotes page; expandable per-client cards showing invoices, accepted quotes, and quick actions; omni search filters cards by client name, company, contact, invoice number, job name, and quote title
- Invoice lifecycle: `DRAFT → SENT → PARTIAL → PAID` (or `VOID`)
- AI-assisted invoice creation — describe the work, get a pre-filled draft
- Send invoices by email with PDF attachment and configurable payment methods
- Partial payment recording with optional bank transaction link
- Payment actions: remove a recorded payment or move it to another open invoice; both recalculate invoice status atomically
- Auto-match bank transactions to open invoices by amount at import time; manual suggestion review for near-matches
- Invoice renegotiation flow: void original, create replacement draft with credit line for partial payments already received; full audit trail via `replacesInvoice` / `replacedBy` links
- Download invoice as PDF at any stage

### Receipts
- Mobile-first receipt capture: take a photo or pick from gallery; client-side Canvas compression before upload
- Mistral OCR extracts text from receipt images; Claude structures it into JSON (vendor, total, tax, items, category)
- Compressed WebP thumbnail stored in UploadThing; original discarded after processing
- Lightbox viewer, retry failed receipts, link receipts to transactions
- `/receipts` page with grid view and expand/collapse card details

### Projects (PROPERTY)
- Units, leases, tenants, rent roll
- Tenant payment tracking, overdue alerts
- Maintenance request management
- Tenant messaging portal

### AI Agent
- Multi-agent system: domain classifier routes questions to a Finance agent or Property agent (or both)
- Finance agent answers questions about transactions, categories, spending trends
- Property agent answers questions about occupancy, rent, tenant balances
- Conversation memory across turns within a session

### Bank Sync
- **US** → Plaid (cursor-based incremental sync via PlaidLink)
- **GB** → Finexer (UK Open Banking, 99% coverage, OAuth redirect)
- **EU** → Enable Banking (PSD2/Berlin Group, 2,500+ banks across 29 countries, OAuth redirect)
- Browser-agent fallback (Playwright + Browserless.io) for institutions not covered by Open Banking APIs
- AES-256-GCM encrypted token storage per user

## Stack

- **Framework**: Next.js App Router (`output: standalone`), TypeScript
- **Hosting**: Fly.io (shared-cpu-1x, 1GB RAM, `fra` region, suspend-when-idle)
- **Auth**: Clerk
- **Database**: PostgreSQL (Neon) via Prisma 7 + `@prisma/adapter-neon` + `@neondatabase/serverless` (WebSocket transport, full transaction support, no `pg`)
- **Styling**: Tailwind CSS 4 + shadcn/ui (base-nova)
- **AI**: OpenRouter (`anthropic/claude-sonnet-4.6` for reasoning, Gemini Flash Lite for classification)
- **PDF**: react-pdf/renderer
- **Bank sync**: Plaid (US), Finexer (GB), Enable Banking (EU); playwright-core + Browserless.io as fallback

## Development

```bash
pnpm install
pnpm dev
```

Requires a `.env.local` with Clerk, Neon, OpenRouter, and encryption secret. See CLAUDE.md for the full variable list.

## Deployment

Hosted on Fly.io. Push to `main` triggers a deploy via GitHub Actions.

```bash
fly deploy        # Manual deploy
fly logs          # Tail production logs
fly ssh console   # SSH into the container
```

Requires a `FLY_API_TOKEN` secret in GitHub repo settings.

## Pending setup

### Email notifications (Resend) — not yet configured
Invoice sending and message notifications are implemented but disabled until Resend is set up.

1. Create an account at [resend.com](https://resend.com)
2. Verify the domain `backoffice.cv`
3. Add to Netlify environment variables:
   - `RESEND_API_KEY` — from Resend dashboard
   - `RESEND_FROM` — `Backoffice <noreply@backoffice.cv>`

Without these vars the app works fine — email sending is silently skipped.

## Known gotchas

### Prisma generated client (v7)

Prisma 7 uses the `prisma-client` generator which outputs to `src/generated/prisma/` **without** an `index.ts` — the entry point is `client.ts`. All imports must use:

```ts
import { PrismaClient } from '@/generated/prisma/client'
```

DB CLI commands require an explicit `DATABASE_URL` prefix — Prisma's config loader does not read `.env.local`:

```bash
DATABASE_URL="$(netlify env:get DATABASE_URL)" pnpm db:push
DATABASE_URL="$(netlify env:get DATABASE_URL)" pnpm prisma generate
```

`src/generated/` is gitignored — rebuilt automatically at Netlify deploy time.

### Prisma adapter — PrismaNeon (WebSocket)

Uses `@prisma/adapter-neon` (`PrismaNeon`) with `@neondatabase/serverless` for WebSocket transport. This is required for `$transaction` support — `PrismaNeonHttp` (HTTP mode) does **not** support transactions and will throw at runtime on any `$transaction` call, including Prisma nested writes. `pg` / `@prisma/adapter-pg` are not installed.

### Netlify serverless — no fire-and-forget

Async work (invoice matching, tenant matching) must be `await`ed before returning a response. The process is killed the moment the response is sent — `.then().catch()` background chains never run. Use `await Promise.allSettled([...])`.

### Invoice AI models

Invoice AI routes call `anthropic/claude-sonnet-4.6` via OpenRouter and expect JSON. Routes strip markdown code fences and fall back to extracting the first `{...}` block.

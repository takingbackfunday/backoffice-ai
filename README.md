# Backoffice AI

Financial management tool for freelancers, consultants, and small property managers.

## Features

### Transactions & Categorisation
- Import bank transactions via CSV upload or automated bank sync (Browserless.io + Playwright)
- Duplicate detection via SHA-256 hash over `(account, date, amount, description)`
- Auto-categorise at import using a priority-ordered rules engine (regex, amount ranges, payee match, etc.)
- AI rules agent suggests new rules based on transaction edits
- Pivot table view for cross-category analysis

### Projects (CLIENT)
- Client projects with jobs, invoices, and payment tracking
- Invoice lifecycle: `DRAFT → SENT → PARTIAL → PAID` (or `VOID`)
- AI-assisted invoice creation — describe the work, get a pre-filled draft
- Send invoices by email with PDF attachment and configurable payment methods
- Partial payment recording with optional bank transaction link
- Auto-match bank transactions to open invoices by amount at import time; manual suggestion review for near-matches
- Invoice renegotiation flow: void original, create replacement draft with credit line for partial payments already received; full audit trail via `replacesInvoice` / `replacedBy` links
- Download invoice as PDF at any stage

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
- LLM-guided browser automation discovers the CSV download flow for any bank
- Saves a playbook per account; subsequent syncs replay it automatically
- AES-256-GCM encrypted credential storage per user

## Stack

- **Framework**: Next.js App Router, TypeScript
- **Auth**: Clerk
- **Database**: PostgreSQL (Neon) via Prisma 7
- **Styling**: Tailwind CSS 4 + shadcn/ui (base-nova)
- **AI**: OpenRouter (`anthropic/claude-sonnet-4.6` for reasoning, Gemini Flash Lite for classification)
- **PDF**: react-pdf/renderer
- **Bank automation**: playwright-core + Browserless.io

## Development

```bash
pnpm install
pnpm dev
```

Requires a `.env.local` with Clerk, Neon, OpenRouter, Browserless, and encryption secret. See CLAUDE.md for the full variable list.

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

### Netlify serverless — no fire-and-forget

Async work (invoice matching, tenant matching) must be `await`ed before returning a response. The process is killed the moment the response is sent — `.then().catch()` background chains never run. Use `await Promise.allSettled([...])`.

### Invoice AI models

Invoice AI routes call `anthropic/claude-sonnet-4.6` via OpenRouter and expect JSON. Routes strip markdown code fences and fall back to extracting the first `{...}` block.

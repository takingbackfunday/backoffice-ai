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

**Stack:** Next.js 15 App Router, TypeScript, PostgreSQL (Neon) + Prisma, Clerk auth, Tailwind CSS 4, shadcn/ui (base-nova), Zustand, Recharts, date-fns, decimal.js.

### Data Model

All user data is isolated by Clerk `userId` (no org-level sharing). Core Prisma models:

- `Account` — bank accounts/cards
- `Transaction` — financial transactions; have optional `categoryId`, `payeeId`, `projectId`; duplicate detection via a content hash
- `Category` / `CategoryGroup` — hierarchical expense categories
- `Payee` — counterparties extracted from transaction descriptions
- `CategorizationRule` — user-defined auto-categorization rules (evaluated by the rules engine)
- `ImportBatch` — tracks CSV import sessions
- `InstitutionSchema` — global (non-user) CSV column mapping templates for banks
- `Project` — client/property/job entities for tagging transactions
- `UserPreference` — per-user UI state

### API Routes (`src/app/api/`)

Each resource has its own directory (e.g. `api/transactions/`, `api/rules/`). Routes use `@/lib/api-response` helpers for consistent success/error responses. All routes are protected by Clerk middleware.

### Rules Engine (`src/lib/rules/`)

`engine.ts` evaluates `CategorizationRule` records against transactions. Rules have typed conditions (field, operator, value) and an action (set category/payee). The engine is used both during CSV import (batch) and when manually triggering categorization.

### LLM / Agent Integration (`src/lib/agent/`, `src/lib/llm/`)

OpenRouter API (configured in `src/lib/llm/openrouter.ts`) with tool-calling support. Agents exist for:
- Financial Q&A on dashboard data
- Generating categorization rules from natural language
- Validating and mapping CSV column headers during import

### CSV Import Flow

Upload (`/upload`) and import are separate concerns. `InstitutionSchema` defines how columns map to `Transaction` fields per bank. LLM assists with fuzzy column matching. Duplicates are detected by hash before insert.

### Dashboard Widgets (`src/components/widgets/`, `src/lib/widgets/`)

Modular chart widgets (Recharts). Each widget fetches from a dedicated `api/widgets/` endpoint. Widgets support relative date range filtering with an Apply button pattern—the applied range is stored separately from the in-progress selection.

### Client State

Zustand stores in `src/stores/` manage UI state (e.g. selected date ranges, filter state). Server data fetching uses standard Next.js patterns (server components + `fetch` in client components as needed).

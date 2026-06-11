# Backoffice AI — Architecture Improvement & Execution Plan

**Audience**: This document is written for an autonomous coding agent (Claude Sonnet 4.6) executing against the repository at `takingbackfunday/backoffice-ai`. Every recommendation includes the *why*, the *concrete change*, the *files involved*, and *acceptance criteria*. Workstreams are ordered by priority and designed to be executed independently — each one should land as its own coherent change set that builds and lints cleanly before moving on.

**Ground truth this plan is based on** (verified against the actual repo, not the architecture doc):

- 441 TypeScript files, ~71k LOC in `src/`, 137 API route files, 45 Prisma models, 1,229-line schema with 64 indexes.
- **Zero test files** anywhere in the repository. No test runner is configured in `package.json`.
- Largest client components: `transaction-table.tsx` (2,291 lines, 89 hook call sites), `studio-client.tsx` (1,365), `portfolio-client.tsx` (1,288), `applicant-detail.tsx` (1,226), `invoice-editor.tsx` (1,105), `quote-generator.tsx` (1,002).
- **Money math is done with `Number()` casts on Prisma `Decimal` fields in ~35 call sites** (`Number(li.quantity) * Number(li.unitPrice)` etc.), including `src/lib/invoice-status.ts` which decides PAID vs PARTIAL. `decimal.js` is a dependency but is imported in exactly one file.
- **Ownership authorization is duplicated ~60 times** — `prisma.workspace.findFirst({ where: { id, userId } })` boilerplate repeated per route handler.
- Zod validation exists in 76 of 137 routes (~55%); the rest parse request bodies untyped or with inline casts.
- `src/lib/rate-limit.ts` is an in-memory `Map` — resets on deploy, breaks the moment Fly.io scales past one machine, and is not applied to the AI endpoints.
- `recalcInvoiceStatus()` only runs on payment/line-item events. **There is no scheduled job, so a SENT invoice whose due date passes never becomes OVERDUE** until some unrelated mutation touches it. The Studio "Overdue" KPI is therefore systematically understated.
- The omni agent (`src/lib/agent/omni-agent.ts`) runs up to 8 tool rounds of Sonnet 4.6 per message via OpenRouter with no per-user budget, no token accounting, and no rate limit.
- `src/app/studio/page.tsx` loads every invoice with all line items and all payments for every client, then computes totals in JS and ships the whole serialized payload to the client component. `portfolio/page.tsx` follows the same pattern.

The architecture is fundamentally sound — server-first Next.js, clean schema, good HITL AI patterns. The problems are concentrated in five areas: **correctness of money math, missing tests, duplicated/inconsistent API plumbing, unbounded AI cost, and dashboard data-fetch scaling**. This plan addresses them in that order, then layers on product improvements.

---

## Priority Legend

| Tier | Meaning |
|------|---------|
| **P0** | Correctness or financial-integrity bug. Do first. Low risk, high payoff. |
| **P1** | Structural debt that compounds (every new feature makes it worse). |
| **P2** | Performance and scaling for power users. |
| **P3** | Product/UX improvements that need P0–P1 foundations. |

Execute workstreams in numbered order. Within a workstream, steps are sequenced. Do not start a P2/P3 item if a P0 item in the same files is incomplete — you will create merge churn.

---

## Workstream 1 (P0): Money Correctness — Centralize Decimal Arithmetic

### Problem

The database stores money as `Decimal(12,2)` (correct), but the application layer immediately degrades it: `Number(li.quantity) * Number(li.unitPrice)` appears throughout `invoice-status.ts`, `studio/page.tsx`, `invoice-matching.ts`, the studio client, and the PDF generators. IEEE-754 float math on currency produces classic errors (`0.1 + 0.2 !== 0.3`), and the comparison `paid >= total` in `recalcInvoiceStatus` is exactly the kind of place where a float epsilon flips an invoice between PARTIAL and PAID. With multi-currency, FX conversion in `src/lib/fx.ts` compounds the drift.

### Changes

1. **Create `src/lib/money.ts`** — a single module that owns all currency arithmetic. Use `decimal.js` (already a dependency). Export:
   ```ts
   import Decimal from 'decimal.js'

   export type Money = Decimal
   export const money = (v: Decimal.Value | null | undefined): Money => new Decimal(v ?? 0)
   export const sum = (items: Decimal.Value[]): Money => items.reduce<Decimal>((s, v) => s.plus(v ?? 0), new Decimal(0))
   export const lineTotal = (qty: Decimal.Value, unitPrice: Decimal.Value): Money => money(qty).times(unitPrice).toDecimalPlaces(2)
   export const gte = (a: Decimal.Value, b: Decimal.Value): boolean => money(a).gte(b)
   export const toCents = (m: Money): number => m.times(100).round().toNumber()
   export const toDisplay = (m: Decimal.Value): number => money(m).toDecimalPlaces(2).toNumber() // ONLY at the serialization boundary
   ```
   Rule for all future code: Prisma `Decimal` values stay `Decimal` until the final serialization for the client, where `toDisplay()` is the only sanctioned escape hatch.

2. **Refactor every money computation site** to use this module. Find them with:
   ```bash
   grep -rn "Number(.*quantity\|Number(.*unitPrice\|Number(.*amount\|Number(pay\|Number(inv" src --include="*.ts" --include="*.tsx"
   ```
   Priority order: `src/lib/invoice-status.ts` → `src/lib/invoice-matching.ts` → invoice/quote/estimate API routes → `studio/page.tsx` and `portfolio/page.tsx` server computations → PDF generators. Client components that only *display* pre-computed numbers can keep plain `number` props.

3. **Extract invoice total computation into one function.** The expression `lineItems.filter(li => !li.forgivenAt).reduce(...)` is reimplemented in at least four places (status recalc, studio page, invoice detail, matching). Create `computeInvoiceTotals(invoice: { lineItems, payments }): { total: Money; paid: Money; balance: Money }` in `src/lib/invoice-status.ts` and make every consumer call it. The `forgivenAt` and `voidedAt` filters must live in exactly one place — today, forgetting one of those filters in a new call site silently corrupts a KPI.

4. **Payment matching tolerance.** In `invoice-matching.ts`, replace any float-equality or near-match logic with `Decimal`-based comparison and an explicit, named tolerance constant (e.g. `MATCH_TOLERANCE = money('0.01')`).

### Acceptance criteria

- `grep -rn "Number(" src/lib/invoice-status.ts src/lib/invoice-matching.ts` returns zero money-field hits.
- `pnpm build` passes.
- Unit tests from Workstream 2 cover: PARTIAL→PAID boundary at exact total, overpayment, forgiven line items, voided payments, and a known float-trap case (`3 × 0.1` style quantities).

---

## Workstream 2 (P0): Test Infrastructure + Tests for Financial Logic

### Problem

There are no tests. The highest-risk logic — rules engine, invoice status, payment matching, dedup hashing, FX conversion, doc tokens — is pure or nearly-pure TypeScript that is trivially testable, and it guards real money. Any refactor (including the rest of this plan) is unsafe without this net. This workstream is sequenced second only because Workstream 1 changes the code under test; in practice, write the tests *while* doing Workstream 1.

### Changes

1. **Add Vitest.** It is the natural fit for a TS/Next/ESM codebase and needs near-zero config:
   ```bash
   pnpm add -D vitest @vitest/coverage-v8
   ```
   `vitest.config.ts` with the `@/` path alias mirrored from `tsconfig.json`. Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. Do **not** pull in jsdom/React Testing Library yet — pure-logic coverage is the 80/20 here.

2. **Test targets, in order of value** (place tests as `*.test.ts` siblings):
   - `src/lib/rules/evaluate-condition.ts` — every operator, field extraction, case sensitivity, null fields, malformed conditions JSON.
   - `src/lib/rules/engine.ts` — priority ordering, first-match-wins vs accumulation semantics (whichever it actually implements — pin it in a test so it can never silently change).
   - `src/lib/invoice-status.ts` — full status matrix including the DRAFT/VOID early-return, plus the Decimal cases from Workstream 1.
   - `src/lib/dedup.ts` — hash stability (a snapshot of known inputs → known hashes; if this hash ever changes, every user re-imports duplicates).
   - `src/lib/fx.ts` — carry-forward for missing months, EUR-base triangulation, identity conversion.
   - `src/lib/doc-token.ts` — sign/verify roundtrip, expiry, tamper rejection, single-use semantics.
   - `src/lib/invoice-matching.ts` — extract the pure matching/scoring logic from the Prisma I/O first (small refactor: a function that takes candidate transactions + open invoices and returns suggestions), then test it. This refactor also unlocks Workstream 5's background-job move.

3. **Mocking policy**: do not mock Prisma. Instead, refactor so the logic under test takes plain data in and returns plain data out, with thin I/O wrappers around it. Where that's impractical, skip the test rather than building a fragile mock layer.

4. **CI**: add `.github/workflows/ci.yml` running `pnpm lint && pnpm test && pnpm build` on PRs. The build script already runs `build:capabilities` and `prisma generate`; ensure `DATABASE_URL` is stubbed for `prisma generate` (it doesn't need a live DB).

### Acceptance criteria

- `pnpm test` passes with ≥ 60 assertions across the modules above.
- CI workflow green on a no-op PR.
- The dedup hash snapshot test exists (this is the single most important regression guard in the repo).

---

## Workstream 3 (P0): Invoice OVERDUE Is Never Triggered — Add a Scheduled Recalc

### Problem

`recalcInvoiceStatus()` sets OVERDUE only when invoked, and it's only invoked on payment/line-item mutations. An invoice that is sent and then ignored — the exact case OVERDUE exists for — never transitions. The Studio "Invoices Overdue" KPI, the "Take notice" banners, and the AI agent's answers about overdue clients are all wrong for any invoice that hasn't been touched since its due date passed. There is no cron in `fly.toml` or anywhere else.

### Changes

1. **Make status a derived concept at read time, stored status as a cache.** Add `deriveInvoiceStatus(invoice, now: Date)` (pure, tested) next to `computeInvoiceTotals` in `src/lib/invoice-status.ts`. Anywhere the UI or agent reads status for display/KPIs, derive it; the stored enum remains for indexing and filtering.
2. **Add a sweep endpoint** `POST /api/internal/sweep-overdue` that bulk-updates `SENT → OVERDUE` where `dueDate < now()`:
   ```ts
   await prisma.invoice.updateMany({
     where: { status: 'SENT', dueDate: { lt: new Date() } },
     data: { status: 'OVERDUE' },
   })
   ```
   Protect it with a shared-secret header (`INTERNAL_CRON_SECRET` env var). Schedule it via a Fly.io scheduled machine or an external cron (GitHub Actions `schedule:` hitting the endpoint daily is acceptable and free). Document the choice in `CLAUDE.md`.
3. **Lazy repair as belt-and-braces**: in `studio/page.tsx` and the invoice list route, when an invoice's derived status disagrees with stored status, fire a non-blocking `recalcInvoiceStatus` (or rely on the derived value for display). This guarantees correct KPIs even between sweeps.
4. Apply the same audit to **lease expiry** (`Expiring ≤90d` in Portfolio) and any other time-driven status — verify whether those are computed at read time (fine) or stored (needs the same treatment).

### Acceptance criteria

- A test proves `deriveInvoiceStatus` flips SENT→OVERDUE exactly at the due-date boundary and respects timezone handling (use UTC date-only comparison consistent with the Neon timezone gotcha documented in `CLAUDE.md`).
- Studio KPI for Overdue is computed from derived status.
- Sweep endpoint exists, is secret-protected, and is wired to a schedule.

---

## Workstream 4 (P1): API Layer Consolidation — Kill the 60× Ownership Boilerplate

### Problem

Each of the 137 route files independently re-implements: auth extraction, params awaiting, workspace ownership lookup, Zod parsing (or not — 45% of routes skip it), try/catch, and response shaping. This is ~40 lines of ceremony per route, it drifts (some routes `findFirst` with different includes, some forget the `userId` scoping in nested lookups), and every missing Zod schema is an unvalidated write path into a financial database.

### Changes

1. **Create `src/lib/api-handler.ts`** with a composable wrapper:
   ```ts
   import { auth } from '@clerk/nextjs/server'
   import { z } from 'zod'
   import { prisma } from '@/lib/prisma'
   import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

   type HandlerCtx<P, B> = { userId: string; params: P; body: B; request: Request }

   export function authedRoute<P = unknown, B = unknown>(opts: {
     paramsSchema?: z.ZodType<P>
     bodySchema?: z.ZodType<B>
     handler: (ctx: HandlerCtx<P, B>) => Promise<Response>
   }) {
     return async (request: Request, route?: { params: Promise<unknown> }) => {
       try {
         const { userId } = await auth()
         if (!userId) return unauthorized()
         const rawParams = route ? await route.params : {}
         const params = opts.paramsSchema ? opts.paramsSchema.parse(rawParams) : (rawParams as P)
         let body = undefined as B
         if (opts.bodySchema) {
           const parsed = opts.bodySchema.safeParse(await request.json().catch(() => ({})))
           if (!parsed.success) return badRequest(parsed.error.issues.map(i => i.message).join('; '))
           body = parsed.data
         }
         return await opts.handler({ userId, params, body, request })
       } catch (err) {
         console.error(err)
         return serverError('Internal error')
       }
     }
   }
   ```
2. **Create `src/lib/authz.ts`** with the canonical ownership lookups, replacing the 60 ad-hoc `workspace.findFirst` calls:
   ```ts
   export async function requireWorkspace(userId: string, workspaceId: string, include?: Prisma.WorkspaceInclude) { ... } // throws NotFoundError
   export async function requireInvoice(userId: string, invoiceId: string) { ... } // scoped through workspace ownership
   // ...one per top-level entity that routes load by id
   ```
   These functions must *always* scope by `userId` in the where clause — make it impossible to forget. Have `authedRoute`'s catch block translate a thrown `NotFoundError` into `notFound()`.
3. **Migrate routes incrementally**: start with the highest-risk write routes (invoices, payments, quotes, estimates, work orders, bills, leases), then transactions, then the rest. Each migrated route must end up with a Zod body schema — this closes the 45% validation gap as a side effect. Keep route behavior identical; this is a pure refactor, verified by the existing UI flows and any tests.
4. **Inventory the gap first**: generate a checklist with
   ```bash
   grep -rL "bodySchema\|safeParse\|\.parse(" src/app/api --include="route.ts"
   ```
   and track migration in a `docs/api-migration.md` checklist so the work is resumable across sessions.

### Acceptance criteria

- All invoice/payment/quote/estimate/bill/lease write routes use `authedRoute` + Zod + `authz` helpers.
- No route under `src/app/api/projects/**` contains an inline `workspace.findFirst` ownership check.
- POST with malformed bodies to migrated routes returns 400 with messages, not 500.

---

## Workstream 5 (P1): AI Cost Control & Agent Hardening

### Problem

`POST /api/agent/omni` runs up to 8 rounds of Sonnet 4.6 per message with: no per-user rate limit, no token/cost accounting, no persistence of sessions, and an in-memory rate limiter that doesn't survive deploys and isn't applied here anyway. A single user (or a runaway client loop) can generate unbounded OpenRouter spend. Additionally, the system prompt lives as a template literal inside `omni-agent.ts`, and `buildSnapshot()` runs 6 Prisma queries on *every* message.

### Changes

1. **Add an `AgentUsage` model** to the schema:
   ```prisma
   model AgentUsage {
     id           String   @id @default(cuid())
     userId       String
     endpoint     String   // 'omni' | 'rules' | 'analyze' | 'search'
     model        String
     inputTokens  Int
     outputTokens Int
     toolRounds   Int
     durationMs   Int
     createdAt    DateTime @default(now())
     @@index([userId, createdAt])
   }
   ```
   OpenRouter returns `usage` in responses — capture it in `src/lib/llm/openrouter.ts` and have `runToolLoop` accumulate and persist one row per agent run (fire-and-forget, logged on failure).
2. **Per-user budget gate** in the omni/rules/analyze routes, before starting the loop: sum the last 24h of `AgentUsage` tokens; if over a configurable cap (`AGENT_DAILY_TOKEN_CAP`, default e.g. 500k), return a friendly 429 SSE `error` event ("You've hit today's AI limit"). This replaces reliance on the in-memory limiter for AI endpoints and is deploy/multi-machine safe because it's DB-backed.
3. **Keep the in-memory limiter only as a burst guard** (e.g. 10 agent requests/min/user) and document its single-machine limitation in `CLAUDE.md`. Do not build Redis for this yet — the DB-backed daily cap is the real control.
4. **Cache the snapshot.** `buildSnapshot()`'s six queries change rarely. Cache per-user in module scope with a 60-second TTL keyed by `userId` (acceptable on Fly's persistent Node process), with invalidation on import completion. This removes ~6 queries from every chat message.
5. **Extract the system prompt** to `src/lib/agent/prompts/omni.ts` as a pure function of its inputs, exported and unit-testable. Same for the rules agent. This is a prerequisite for prompt iteration without touching orchestration code, and lets a test assert that critical invariants (the "never state a dollar amount not from a tool" rule, non-deductible exclusions) are present in the assembled prompt.
6. **Bound editor-snapshot churn.** `page-context-store.ts` re-serializes the editor snapshot on every keystroke. Debounce snapshot updates (300ms) in `usePageContext` — the agent only reads the snapshot when a message is sent, so per-keystroke freshness buys nothing.

### Acceptance criteria

- Every omni/rules/analyze run writes an `AgentUsage` row with real token counts.
- Exceeding the daily cap returns a clean SSE error event; the chat UI displays it (verify `chat-store.ts` handles `error` events gracefully).
- Snapshot cache demonstrably skips DB queries on a second message within 60s (log line or test).
- Typing in the invoice editor triggers at most ~3 snapshot serializations per second.

---

## Workstream 6 (P2): Dashboard Data-Fetch Scaling (Studio & Portfolio)

### Problem

`studio/page.tsx` loads **every invoice with every line item and every payment for every client** to compute KPIs and card summaries in JS, then serializes the entire structure into the client component's props. A consultant with 50 clients × 100 invoices × 5 line items is ~25k rows fetched and shipped per page load. `portfolio/page.tsx` mirrors the pattern. This is the single biggest scaling cliff in the app, and it also makes the page payload huge (RSC serialization of every invoice).

### Changes

1. **Move KPI aggregation into SQL.** Replace the JS `.map().reduce()` totals with grouped aggregates. Because totals require `SUM(quantity * unitPrice)` with `forgivenAt`/`voidedAt` filters, use `$queryRaw` (the codebase already uses raw SQL for the timezone workaround — follow `CLAUDE.md`'s `AT TIME ZONE 'UTC'` convention for any date predicates):
   ```sql
   SELECT i."clientProfileId",
          i.status,
          COUNT(*)                                           AS invoice_count,
          SUM(li.quantity * li."unitPrice")                  AS total,
          COALESCE(p.paid, 0)                                AS paid
   FROM "Invoice" i
   JOIN "InvoiceLineItem" li ON li."invoiceId" = i.id AND li."forgivenAt" IS NULL
   LEFT JOIN LATERAL (
     SELECT SUM(amount) AS paid FROM "InvoicePayment"
     WHERE "invoiceId" = i.id AND "voidedAt" IS NULL
   ) p ON true
   WHERE i."clientProfileId" = ANY($1)
   GROUP BY i."clientProfileId", i.status, p.paid
   ```
   (Adjust to the actual column names in `schema.prisma`; verify with `\d` equivalents via Prisma introspection rather than trusting this sketch.) Wrap it in `src/lib/studio-kpis.ts` returning typed results, and validate the SQL's totals against the existing JS computation on real data before deleting the JS path — run both and `console.assert` equality during a transition period behind a flag.
2. **Lazy-load card detail.** The client cards' expanded bodies (invoice lists, quote lists) should fetch on expand via a new `GET /api/studio/clients/[clientProfileId]/summary` route, instead of being pre-serialized for all clients. The collapsed card needs only: name, company, outstanding, overdue, counts — all available from the KPI aggregate.
3. **Cap and paginate recent activity** server-side (it likely already takes recent N; verify and enforce `take`).
4. Apply the identical treatment to `portfolio/page.tsx` (occupancy, revenue/mo, overdue rent, expiring leases as SQL aggregates; unit/lease detail on expand).
5. **Measure before/after**: log RSC payload size (response content-length of the page) and Prisma query count for a seeded dataset of 50 clients × 100 invoices. Target: page payload under 100KB, under 10 queries.

### Acceptance criteria

- Studio page with the seeded large dataset performs no per-invoice line-item fetch at initial load.
- Outstanding/Overdue KPI values are byte-identical to the legacy JS computation on the validation dataset (this is where Workstream 1's Decimal discipline pays off — do the SQL→Decimal comparison, not float).
- Card expansion fetches details on demand with a loading state.

---

## Workstream 7 (P2): Decompose the Mega-Components

### Problem

`transaction-table.tsx` (2,291 lines, 89 hooks) combines: data fetching, pagination, inline edit state, make-rule popup, bulk-select/delete, NL search, column filters, portal-dropdown coordination, and the fragile `[data-portal-dropdown]` outside-click contract. `studio-client.tsx`, `portfolio-client.tsx`, `applicant-detail.tsx`, and `invoice-editor.tsx` have the same disease. Every bug fix risks unrelated regressions because all state lives in one closure.

### Changes — pattern, then apply

For each mega-component, apply the same recipe rather than a bespoke redesign:

1. **Extract non-visual logic into hooks** under a sibling folder: e.g. `src/components/transactions/hooks/use-transaction-data.ts` (fetch/pagination/filters), `use-inline-edit.ts` (row edit state + commit + the make-rule snap ref), `use-bulk-select.ts`, `use-nl-search.ts`. Hooks own state; the component composes them.
2. **Extract leaf components**: `TransactionRow`, `MakeRulePopup`, `BulkDeleteBar`, `NlSearchBar`, each in its own file with explicit props. The outside-click/portal contract gets centralized: create `src/components/ui/portal-dropdown.tsx` that *always* applies `data-portal-dropdown` and renders via `createPortal`, and a `useOutsideClick(ref, { ignoreSelector: '[data-portal-dropdown]' })` hook — then delete every hand-rolled instance. This converts a fragile DOM convention into an enforced abstraction.
3. **Order of attack**: `transaction-table.tsx` first (highest churn), then `invoice-editor.tsx` (because Workstream 9 touches it), then `studio-client.tsx` (after Workstream 6 changes its data shape — do not decompose it before, or you'll do the work twice), then `work-order-panel.tsx`, then the rest opportunistically.
4. **Hard rule going forward**, add to `CLAUDE.md`: no component file over 400 lines; new dropdowns inside scroll containers must use `PortalDropdown`.
5. Behavior must be pixel-identical. No redesign in this workstream — refactor only, validated by manually exercising: inline edit + make-rule flow, bulk delete, NL search, dropdown inside scrolled table.

### Acceptance criteria

- `transaction-table.tsx` under 400 lines, composing extracted hooks/components.
- Exactly one implementation of the portal-dropdown + outside-click contract in the codebase (`grep -rn "data-portal-dropdown" src` shows only the shared components and the hook).
- `pnpm lint` clean (`react-hooks/rules-of-hooks` will catch extraction mistakes).

---

## Workstream 8 (P2): Background Jobs — From Fire-and-Forget to Durable

### Problem

Post-import work (`runRulesAgentInBackground()`, `matchInvoicePayments()`) runs via `Promise.allSettled` on the request's Node process. On Fly.io with suspend-when-idle, a machine suspension shortly after an import response can kill in-flight background work; errors are swallowed; there is no retry and no user-visible status. The architecture doc calls this out but understates it: *suspend-when-idle is configured in `fly.toml`*, so this isn't theoretical.

### Changes

1. **Add a minimal DB-backed job table** — do not introduce Redis/BullMQ; the scale doesn't justify the operational surface:
   ```prisma
   model BackgroundJob {
     id          String    @id @default(cuid())
     userId      String
     type        String    // 'rules-agent' | 'invoice-matching'
     payload     Json
     status      String    @default("PENDING") // PENDING | RUNNING | DONE | FAILED
     attempts    Int       @default(0)
     lastError   String?
     createdAt   DateTime  @default(now())
     completedAt DateTime?
     @@index([status, createdAt])
   }
   ```
2. **Enqueue instead of invoke** at the end of `transactions/import`: insert PENDING rows, then *also* kick an immediate in-process drain attempt (best-effort, keeps current latency characteristics).
3. **Drain endpoint** `POST /api/internal/drain-jobs` (same `INTERNAL_CRON_SECRET` as Workstream 3) that claims jobs with an atomic `UPDATE ... WHERE status='PENDING' ... RETURNING` (use `$queryRaw` with `FOR UPDATE SKIP LOCKED`), runs them with try/catch, increments `attempts`, marks FAILED after 3. Schedule it alongside the overdue sweep. This makes the system *eventually* correct even when the opportunistic in-process run dies with the machine.
4. **Surface status**: the import success screen and the Studio "Take notice" column should show "Categorization running…" / "3 payment matches found" by polling a lightweight `GET /api/jobs/recent` for the user's last import's jobs. (Small UX win, large trust win — today the user has no idea these systems exist until rows mysteriously change.)
5. `run-rules-agent.ts` is already the single source of truth for the rules agent — the job runner must call it, not duplicate it.

### Acceptance criteria

- Killing the dev server mid-import-background-work leaves PENDING/RUNNING rows that the drain endpoint completes on next invocation.
- Failed jobs persist `lastError` and stop at 3 attempts.
- Import flow latency unchanged (enqueue + opportunistic drain).

---

## Workstream 9 (P3): Pipeline Visibility — Make Estimate → Quote → Invoice and Applicant → Tenant Legible

### Problem (UX)

The schema models both pipelines richly (`replacesInvoiceId`, `quoteId`, `sourceItemIds`, applicant statuses), but the UI shows entities in isolation. Users can't see "this invoice fulfills 40% of quote Q-12, which superseded Q-11, from estimate E-7 v3." Renegotiation chains exist only as foreign keys. The applicant→tenant conversion is a multi-step process with no visual through-line.

### Changes

1. **Build a reusable `PipelineBreadcrumb` component** (`src/components/projects/pipeline-breadcrumb.tsx`): a compact horizontal trail rendered at the top of estimate, quote, and invoice detail pages — `Estimate E-7 (v3) → Quote Q-12 (Accepted) → 2 invoices (€4,200 / €10,000 invoiced)`. Each node links to its entity. Data comes from one new endpoint `GET /api/projects/[id]/pipeline?entity=quote&entityId=...` that walks the FK graph (estimate version chain via `parentId`, quote via `estimateId`/`supersedes`, invoices via `quoteId` + the existing fulfillment computation). Reuse the fulfillment math already behind `…/fulfillment` — do not duplicate it.
2. **Version/renegotiation history panel**: on invoice detail, when `replacesInvoiceId` or `replacedBy` exists, render a collapsed "History" section listing the chain with statuses, amounts, and credit lines. Same for estimate versions on the estimate page.
3. **Applicant pipeline linearization**: in `applicant-detail.tsx` (decompose it per Workstream 7 first), add a stepper header — Inquiry → Application → Screening → Approved → Offered → Converted — with the current stage highlighted and the *next action* as a primary button (e.g. at APPROVED, the primary CTA is "Offer lease"). The statuses already exist; this is presentation plus a `nextAction(applicant): { label, action }` mapping function (pure, testable).
4. Add deep-link anchors for these new sections to the relevant `page.capabilities.ts` sidecars and rerun `build:capabilities` so the omni agent can link users directly to e.g. an invoice's history panel.

### Acceptance criteria

- Quote detail and invoice detail show the breadcrumb with live fulfillment numbers.
- A renegotiated invoice's full chain is visible from either end.
- The applicant detail stepper renders the correct stage and next-action for each status.

---

## Workstream 10 (P3): Targeted Product Improvements

These are smaller, independent items. Execute after the foundations above; each is a self-contained change.

### 10.1 Maintenance request creation from global shortcuts
The architecture doc notes maintenance creation is absent from global modals because the API requires `unitId`. Fix it properly: extend `NewWorkOrderModal`'s step flow so that when a PROPERTY workspace is selected, step 2 offers a unit picker (fetched from `GET /api/projects/[id]/units`) and creates the `MaintenanceRequest` + `WorkOrder` together. The `__new__` sentinel pattern already used for vendors applies directly.

### 10.2 Batched dashboard widgets
The four dashboard widgets each call their own `/api/widgets/*` route. Add `GET /api/widgets/batch?widgets=kpi,cashflow,networth,expenses&from=…&to=…&currency=…` that runs the existing fetchers in `Promise.all` server-side and returns a keyed object. Keep individual routes (per-widget date-range changes still use them); the batch route serves initial load only. Expected effect: 4 round trips → 1 on dashboard mount.

### 10.3 Receipt OCR partial-state persistence
The pipeline (compress → Mistral OCR → Claude extraction → store) restarts from zero on retry. Persist intermediate state on the `Receipt` row: add `ocrMarkdown String?` so a Claude-extraction failure retries only extraction. Gate each stage on whether its output already exists.

### 10.4 SSE consistency audit
The invoice SSE quirk (`token` events carry full text, not deltas) is a per-endpoint inconsistency with the omni agent's delta tokens. Pick one contract — deltas — and normalize: fix the invoice `ai-finalize` stream to emit deltas, update its client handler, and document the SSE event contract in `docs/sse-contract.md` (event names, payload shapes, delta semantics). Future endpoints follow the doc.

### 10.5 Empty/loading/error states pass
Server-first pages tend to handle the happy path. Sweep the main surfaces (Studio, Portfolio, Transactions, Receipts) for: zero-data states with a CTA (e.g. Studio with no clients → "Create your first client" pointing at the existing modal), and client-fetch error states (the transaction table on a failed `GET /api/transactions` should show a retry affordance, not an empty table). Keep it minimal — reuse existing onboarding banner components where possible.

### 10.6 Structured logging
Replace bare `console.error(err)` (which the new `authedRoute` would otherwise propagate everywhere) with a tiny `src/lib/log.ts` that emits single-line JSON (`{ level, msg, userId?, route?, err }`). Fly.io captures stdout; structured lines make `fly logs` greppable. No external service, no dependency.

---

## Execution Order & Dependency Graph

```
WS1 Money ──┬──> WS2 Tests (written alongside WS1)
            │
WS3 Overdue ┘  (uses WS1's computeInvoiceTotals + WS2's runner)

WS4 API consolidation  (independent; start after WS2's CI exists)
WS5 AI cost control    (independent)

WS6 Dashboard scaling  (after WS1 — Decimal parity check; before WS7's studio-client work)
WS7 Decomposition      (transaction-table anytime after WS2; studio-client after WS6)
WS8 Background jobs    (after WS3 establishes the internal-cron pattern)

WS9 Pipeline UX        (after WS7 touches applicant-detail/invoice pages)
WS10 Product items     (anytime after their listed dependencies; 10.2/10.3/10.6 anytime)
```

## Standing Rules for the Executing Agent

1. **One workstream per change set.** Build, lint, and test green before starting the next. Use `pnpm lint && pnpm test && pnpm build` as the gate.
2. **No behavior change during refactors** (WS4, WS7). If you discover a bug mid-refactor, note it in the PR description and fix it in a separate commit/change set, with a test.
3. **Respect the documented gotchas in `CLAUDE.md`**: Prisma import from `@/generated/prisma/client`; `PrismaNeon` (never `PrismaNeonHttp`); UploadThing sizes power-of-2; Neon `timestamptz` → `AT TIME ZONE 'UTC'` in raw SQL; `NEXT_PUBLIC_*` build-time on Fly; transaction `projectId` (query param) vs `workspaceId` (Prisma field).
4. **Update documentation as you go**: every new module, endpoint, env var (`INTERNAL_CRON_SECRET`, `AGENT_DAILY_TOKEN_CAP`), and convention (Money module, PortalDropdown, SSE contract, 400-line component cap) gets an entry in `CLAUDE.md` and, where relevant, `codebase_map.md`. The sidecar `page.capabilities.ts` files must be updated for any page whose purpose or anchors change, followed by `pnpm build:capabilities`.
5. **Never weaken `userId` scoping.** Every Prisma query touching user data must filter by ownership, ideally through the `authz` helpers once WS4 lands. Treat any query you find without it as a P0 finding — fix immediately and add a test.
6. **Decimal at the core, numbers at the edge.** After WS1, any new code doing float math on money fails review.

## What Not to Do

- **Do not add Redis, a queue library, or a separate worker service.** The DB-backed job table and scheduled drain match the app's scale and Fly.io topology.
- **Do not migrate to tRPC/GraphQL or restructure routing.** The REST + `authedRoute` consolidation captures most of the benefit at a fraction of the churn.
- **Do not rewrite the browser-agent bank sync** unless explicitly asked; it's fragile by nature, but Plaid/TrueLayer integration is a product decision (pricing, geographic coverage for an EU user base) that needs a human call, not an agent's.
- **Do not redesign UI** during decomposition workstreams; visual changes belong to WS9/WS10 only.
- **Do not introduce React Testing Library / E2E (Playwright) suites yet.** Pure-logic Vitest coverage is the right first investment; E2E can follow once the API layer stabilizes post-WS4.

---

## Expected End State

After all workstreams: invoice math is exact and centrally owned; the OVERDUE pipeline is live and the Studio KPIs are trustworthy; ~25 critical-path tests run in CI on every change; the API surface validates every write and authorizes through two small modules instead of 60 copies; AI spend is metered and capped per user; the Studio and Portfolio dashboards aggregate in SQL and load detail on demand; the four largest components are decomposed with one shared dropdown abstraction; post-import work survives machine suspension; and the two core pipelines are visually legible end to end. The grade-A architecture stops accruing the specific debts that would have turned it into a grade-B codebase at 10× the data volume.

# SDD — Client Hub notice/KPI filter fix

Slug: `client-hub-notice-filter-fix`
PRD: `docs/prd/client-hub-notice-filter-fix.md`
Date: 2026-08-03
Status: Draft (awaiting approval)

---

## 1. Architecture overview

Pure client-side fix inside the Client Hub component tree. No new endpoints, no schema changes.

```
/src/app/studio/page.tsx                     (server — unchanged)
  └─ <StudioClient>                          studio-client.tsx
       ├─ <StudioTopSection>                 studio-top-section.tsx   (notices + KPI cards)
       └─ <ClientCardsSection>               client-cards-section.tsx (filter + list)
            └─ <ClientCard> × n              client-card.tsx          (expanded body)
                 └─ detail ← fetchCardDetail(clientProfileId)
                      └─ GET /api/studio/clients/[clientProfileId]    (existing, unchanged)
```

**The bug in one line:** `fetchCardDetail` is only invoked from `ClientCard`'s manual `onExpand`; when `clientFilter`/`expandedClient` are set by a notice/KPI click, cards expand with `detail === undefined` → "No details available". Separately, the two quote filters read `client.sentQuotes`/`client.acceptedQuotes`, which `page.tsx` hardcodes to `[]`.

**The fix in three moves:**

1. A `useEffect` in `StudioClient` watches `clientFilter`; when active, it calls `fetchCardDetail` for **every** client matching the filter (parallel, guarded against duplicates by the existing `cardDetails`/`cardLoading` checks).
2. A pure shared predicate `clientMatchesFilter(client, filter, flat, flatQuotes)` in `studio-shared.ts` replaces the six inline filter branches in `ClientCardsSection`, the find-first logic in the four notice handlers (`studio-client.tsx`), and the find-first logic in the KPI handler (`studio-top-section.tsx`). Quote branches read `flatQuotes` (matched on `clientProfileId`); invoice branches read `flatInvoices` (matched on `clientId` = workspace id).
3. `flatQuotes` is threaded into `ClientCardsSection` as a new prop so the quote filters evaluate against real data.

## 2. Data model changes

None. No Prisma edits, no `db:push`.

## 3. API design

None. Reuses the existing lazy-load endpoint unchanged:

- `GET /api/studio/clients/[clientProfileId]` → `src/app/api/studio/clients/[clientProfileId]/route.ts` → `fetchClientDetail(userId, clientProfileId)` in `src/lib/studio-kpis.ts`. Returns `{ invoices, acceptedQuotes, sentQuotes, jobs, receiptCount }` with **derived** invoice statuses (DRAFT preserved; SENT+past-due → OVERDUE; etc.). The expanded body's per-filter predicates (`i.status === 'DRAFT'`, `getDisplayStatus(i) === 'OVERDUE'`, …) are already consistent with this derivation — verified.

## 4. File-by-file change plan

Implementation order is the listing order. Keep every file under the 400-line cap.

### 4.1 `src/components/studio/studio-shared.ts` — add pure predicate

Add and export:

```ts
export function clientMatchesFilter(
  client: Pick<Client, 'id' | 'clientProfileId'>,
  filter: Exclude<ClientFilter, null>,
  flat: FlatInvoice[],
  flatQuotes: FlatQuote[],
): boolean
```

Branch semantics (single source of truth):

| Filter | Rule |
|---|---|
| `outstanding` | `flat.some(i => i.clientId === client.id && (getDisplayStatus(i) === 'SENT' \|\| 'PARTIAL'))` |
| `overdue` | `flat.some(i => i.clientId === client.id && getDisplayStatus(i) === 'OVERDUE')` |
| `unsent` | `flat.some(i => i.clientId === client.id && i.status === 'DRAFT')` |
| `collected` | `flat.some(i => i.clientId === client.id && getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo)` — **30-day window, matching the KPI label** (reconciles drift; FR-6) |
| `awaiting-quotes` | `flatQuotes.some(q => q.clientProfileId === client.clientProfileId && q.status === 'SENT')` |
| `uninvoiced-quotes` | `flatQuotes.some(q => q.clientProfileId === client.clientProfileId && q.status === 'ACCEPTED' && !q.hasInvoice)` |

`thirtyDaysAgo` computed once inside the function from `Date.now()`.

### 4.2 `src/components/studio/studio-shared.test.ts` — NEW (colocated Vitest)

Cover: each of the six branches (positive + negative); quote branches keyed on `clientProfileId` (not `id`); `hasInvoice: true` excluded from `uninvoiced-quotes`; `collected` boundary — PAID invoice with `issueDate` 31 days ago does **not** match, 29 days ago does; SENT invoice past due counts as OVERDUE (via `getDisplayStatus`), not outstanding.

### 4.3 `src/components/studio/client-cards-section.tsx` — new prop + predicate swap

- Add `flatQuotes: FlatQuote[]` to `Props` (import type from `studio-shared`).
- Replace the six inline `clientFilter` branches in the `.filter(client => …)` with:
  `if (clientFilter && !clientMatchesFilter(client, clientFilter, flat, flatQuotes)) return false`
- Leave the omni-search block untouched (out of scope; see PRD §7).
- No other changes. ~122 lines → stays well under cap.

### 4.4 `src/components/studio/studio-client.tsx` — effect + handler simplification

- Import `clientMatchesFilter` from `studio-shared`.
- **Add the auto-fetch effect** (the core fix), placed after `fetchCardDetail`:

```ts
// Fetch card details for all clients matched by an active notice/KPI filter
useEffect(() => {
  if (!clientFilter) return
  for (const c of clients) {
    if (c.clientProfileId && clientMatchesFilter(c, clientFilter, flat, flatQuotes)) {
      fetchCardDetail(c.clientProfileId)
    }
  }
}, [clientFilter, clients, flat, flatQuotes, fetchCardDetail])
```

  Re-runs when `fetchCardDetail` identity changes (it depends on `cardDetails`/`cardLoading`) are harmless: the guard inside `fetchCardDetail` (`if (cardDetails[id] || cardLoading[id]) return`) prevents duplicate network calls.
- In each of the four notice `onClick` handlers, replace the bespoke `clients.find(...)` with `clients.find(c => clientMatchesFilter(c, '<filter>', flat, flatQuotes))`.
- Pass `flatQuotes={flatQuotes}` to `<ClientCardsSection>`.
- **Line budget:** file is 363/400. Effect + import ≈ +12, find-first replacements ≈ −4. Net ~371 — under cap, but coder must verify after edit; if over, extract the notices `useMemo` into `hooks/use-studio-notices.ts`.

### 4.5 `src/components/studio/studio-top-section.tsx` — KPI handler via shared predicate

- Import `clientMatchesFilter` from `studio-shared`.
- Change `handleKpiClick(filter, matchFn)` → `handleKpiClick(filter)`; inside, `const first = clients.find(c => clientMatchesFilter(c, filter, flat, flatQuotes))`. Drop the three inline `matchFn` lambdas at the call sites (Outstanding, Overdue, Collected). This also removes the collected-window drift (FR-6).
- `flatQuotes` is already a prop here. Net line change ≈ neutral (248 lines).

### 4.6 `src/components/studio/client-card.tsx` — collected body window (FR-6)

- In the expanded-body `visibleInvoices` computation, narrow the `collected` branch to match the shared predicate: `getDisplayStatus(i) === 'PAID' && new Date(i.issueDate) >= thirtyDaysAgo` (reuse the existing `thirtyDaysAgo` already computed at the top of the card-header IIFE — hoist it to component scope so both IIFEs can use it).
- No other visual changes.

### 4.7 `codebase_map.md` — keep the map truthful

Update the two Client Hub prose blocks ("Take notice — filter behaviour" and "Filtered card appearance") to state: programmatic expansion triggers the lazy detail fetch for all matched clients; quote filters read `flatQuotes` via the shared `clientMatchesFilter` predicate in `studio-shared.ts`.

## 5. Reuse map

| Existing module | How it's reused |
|---|---|
| `fetchCardDetail` + `cardDetails`/`cardLoading` state (`studio-client.tsx`) | Called in a loop by the new effect; duplicate-fetch guard makes re-runs safe |
| `getDisplayStatus` (`studio-shared.ts`) | Used by the new predicate (SENT+past-due → OVERDUE), consistent with SQL derivation in `fetchClientDetail`/`fetchLightweightInvoices` |
| `FlatInvoice` / `FlatQuote` / `ClientFilter` types (`studio-shared.ts`) | Predicate signature |
| Existing per-card spinner + "No details available" empty state (`client-card.tsx`) | Loading/failure UX for the newly-triggered fetches — no new UI |
| `flatQuotes` prop already flowing into `StudioTopSection` | Now also threaded into `ClientCardsSection` |

## 6. Edge cases & error handling

- **Fetch failure / non-200:** `fetchCardDetail` swallows errors (existing); card shows "No details available". `cardLoading` resets via `finally`, so a later manual expand retries. Unchanged behavior.
- **Missing `clientProfileId`:** guarded (`if (client.clientProfileId)`), same as manual expand today.
- **Filter toggled off mid-flight:** effect early-returns on `null`; in-flight fetches settle harmlessly into `cardDetails` cache.
- **Effect re-runs on `fetchCardDetail` identity change** (its `useCallback` deps are `cardDetails`/`cardLoading`): every re-run re-loops but the guard short-circuits before any network call. No fetch storms.
- **DRAFT/OVERDUE status consistency** between `flatInvoices` (list) and `detail.invoices` (body): both derive identically (DRAFT preserved; OVERDUE from SENT+past-due) — a client that matches is guaranteed to have visible rows in its body.
- **Many matching clients → N parallel requests:** bounded by visible cards; endpoint is a single indexed query per call.
- **Client search + filter combined:** unchanged semantics — search narrows within the filtered set.
- **30-day boundary for `collected`:** inclusive (`>=`); both list and body use `new Date(i.issueDate)` against the same reference instant per render.

## 7. Testing strategy

- **New unit tests:** `src/components/studio/studio-shared.test.ts` (per §4.2) — pure predicate, no I/O, follows the colocated `*.test.ts` convention (`money.test.ts` pattern).
- **Manual verification matrix:** fresh page load → click each of the 6 notice/KPI filters without prior manual expansion → matching cards expand, spinner, rows appear; re-click toggles off; quote notices no longer empty the list; multi-client match expands and populates all.
- **Commands:** `pnpm lint && pnpm test`, then `DIRECT_URL="postgresql://x:x@localhost/x" pnpm build` (dummy DIRECT_URL per CLAUDE.md — client-only change, but build typechecks).

## 8. Rollout notes

- No env vars, no migration, no DB access changes. Standard deploy (commit without pushing; push triggers Fly.io deploy only when the user asks).
- No capabilities sidecar changes (`/studio` `page.capabilities.ts` describes the page purpose, not filter internals) — but coder should sanity-check that the sidecar's claims about notice filtering remain accurate; update only if it describes the buggy behavior.
- `codebase_map.md` prose update included (§4.7).

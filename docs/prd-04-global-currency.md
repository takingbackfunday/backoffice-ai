# PRD-04 — Global Currency Selector & Pivot Currency Support

Status: Draft · Owner: Staff Eng · Date: 2026-07-24 · Priority: P1 · SDD: `sdd-04-global-currency.md`

## Problem

Display currency is a dashboard-only concept today:

1. **The picker only exists on the dashboard.** `DashboardHeader` has a private
   USD/EUR/GBP toggle next to the `UserButton`; the shared layout header used by
   the other 14 pages shows only the `UserButton`. Users can't see or change
   display currency from anywhere else.
2. **The pivot table ignores it.** `/pivot` fetches `/api/pivot` with no currency
   parameter, the API doesn't even select the account currency, and the only
   amount formatter hardcodes `$` (`src/lib/pivot/engine.ts:16-27`). A EUR user
   sees dollar-signed, unconverted numbers.

## Goals

- One currency selector, always visible next to the user account icon on every
  page (dashboard included — one shared implementation).
- The pivot table converts and formats amounts in the selected display currency,
  consistent with dashboard widgets.
- Selection persists (existing `UserPreference.data.dashboardCurrency`) and takes
  effect immediately without a page refresh.

## Non-goals

- New currencies beyond USD/EUR/GBP (limited by `FxRate` coverage).
- Per-transaction currency overrides (transactions inherit account currency —
  unchanged).
- Converting the transactions page Amount column (stays raw account currency —
  see Decisions).
- Invoice/quote document currency (`invoiceDefaults.currency`) — a separate
  concept; explicitly out of scope to avoid conflation.
- Adding currency as a pivot *field* (group-by); could follow later once the API
  selects account currency.

## User stories

- As a user on any page, I can see which display currency is active and change it
  from the header without navigating to the dashboard.
- As a EUR-based user, the pivot table shows converted EUR amounts with the `€`
  symbol, matching the dashboard.
- As a user, switching currency in the header updates the pivot table (and
  dashboard widgets) immediately.

## Requirements

### R1 — Global currency selector (item #8, part 1)

- Extract the dashboard's currency toggle into a shared `CurrencyPicker` client
  component; render it in the shared layout `Header` immediately left of
  `UserButton` on all pages.
- Refactor `DashboardHeader` to use the same picker (or retire it in favor of the
  shared `Header`) — there must be exactly one picker implementation.
- Consolidate the duplicated `CURRENCIES` / `SYMBOLS` constants (currently in
  `dashboard-header.tsx`, `KpiBar.tsx`, `CashflowWidget.tsx`, `dashboard/page.tsx`)
  into one module.
- State: a small client-side currency store (Zustand, consistent with existing
  stores) hydrated from `/api/preferences`; changes POST
  `{ dashboardCurrency }` back (existing route, shallow merge) and broadcast to
  subscribers immediately.
- Server-seeded default (dashboard infers from earliest account currency when
  unset) remains the initial hydration source where available.

### R2 — Pivot currency support (item #8, part 2)

- `/api/pivot` selects `a.currency` per row, accepts `?currency=USD|EUR|GBP`, and
  converts amounts server-side via the existing `convertAmounts()` (month from
  transaction date — same convention as widgets).
- The pivot page reads the active currency from the currency store and refetches
  on change (same pattern as dashboard widgets).
- `formatValue` gains a currency/symbol parameter; all 12 call sites in
  `pivot-table.tsx` pass it through. `count` aggregation stays symbol-free.
- CSV export stays raw numbers (spreadsheet-friendly), but the export filename
  includes the currency (e.g. `pivot-EUR-2026-07-24.csv`).

### R3 — No regressions on the dashboard

- Widgets keep working through the refactor: `dashboard-client.tsx` switches its
  local `useState` to the shared store; server seeding in `dashboard/page.tsx`
  stays.

## Success metrics

- Currency picker visible on all 15 pages' headers (spot-check 5 routes).
- With EUR selected, `/pivot` renders `€`-signed values equal to
  dashboard-converted totals for the same period (manual cross-check).
- Currency change propagates to pivot and widgets without reload.

## Alternatives considered

- **React context provider for currency.** Rejected in favor of a Zustand store:
  consistent with `chat-store`, `page-context-store`, `upload-store`; avoids
  wrapping server-rendered shells in a client provider.
- **Prop-drilling currency into `Header` from every page.** Rejected: touches 14
  server pages for plumbing a client concern; the store hydrates itself from
  `/api/preferences`.
- **Client-side conversion in pivot.** Rejected: rates live server-side
  (`fx.ts` is Prisma-backed); server conversion matches widgets exactly.
- **`Intl.NumberFormat` currency style for pivot.** Considered; deferred —
  pivot's accounting format (parenthesized negatives, `truncate` no-decimals
  mode) is intentional. We parameterize the existing formatter instead.

## Decisions (confirmed 2026-07-24)

- **The transactions page Amount column stays raw** (account currency, no
  conversion). It's a ledger; the global selector affects dashboard widgets and
  the pivot table only.

# SDD-04 — Global Currency Selector & Pivot Currency Support

Status: Draft · Date: 2026-07-24 · PRD: `prd-04-global-currency.md` · Effort: M (3–4 days)

## Current-state facts (verified)

- Two headers render `UserButton`: shared `src/components/layout/header.tsx`
  (14 pages, server component, 20 lines) and dashboard-only
  `src/components/dashboard/dashboard-header.tsx` (51 lines, holds the picker).
- Picker: 3-button toggle, inline in dashboard-header; persists via
  `POST /api/preferences { dashboardCurrency }` (fire-and-forget) from
  `dashboard-client.tsx:17-28` local state; widgets get it via props and refetch.
- Server seed: `src/app/dashboard/page.tsx:21-38` reads pref; when absent infers
  from earliest `Account.currency` and upserts.
- Conversion: `src/lib/fx.ts` — `getRate(from,to,month)`, `convertAmounts(rows,
  target)`; source currency = `transaction.account.currency`; month = txn month;
  `DashboardCurrency = 'USD'|'EUR'|'GBP'`.
- Symbol maps duplicated in `KpiBar.tsx:7`, `CashflowWidget.tsx` (~160),
  `dashboard/page.tsx:9` (`SUPPORTED`), `dashboard-header.tsx:5-10`.
- Pivot: `pivot-page-client.tsx:40` fetches `/api/pivot` (no currency);
  `src/app/api/pivot/route.ts` raw SQL doesn't select `a.currency`;
  `formatValue` (`src/lib/pivot/engine.ts:16-27`) hardcodes `$`, called from 12
  sites in `pivot-table.tsx`. Pivot page already fetches `/api/preferences` on
  mount for `pivotConfig` (lines 63-78).
- No currency context/store exists anywhere.

## Design

### A. Shared constants + store

`src/lib/fx.ts` (or new `src/lib/currency.ts` re-exported from fx) gains:

```ts
export const CURRENCIES: { value: DashboardCurrency; symbol: string; label: string }[]
export const CURRENCY_SYMBOLS: Record<DashboardCurrency, string>
```

Delete the local copies in `dashboard-header.tsx`, `KpiBar.tsx`,
`CashflowWidget.tsx`, `dashboard/page.tsx`.

New `src/stores/currency-store.ts`:

```ts
interface CurrencyStore {
  currency: DashboardCurrency
  hydrated: boolean
  hydrate: (initial?: DashboardCurrency) => Promise<void>  // uses initial, else GET /api/preferences
  setCurrency: (c: DashboardCurrency) => void              // optimistic set + POST /api/preferences
}
```

- `hydrate(initial)`: dashboard calls with its server-seeded value; other pages
  call without → one `GET /api/preferences`. Idempotent after first call.
- `setCurrency`: set immediately, fire-and-forget POST (same as today's
  dashboard behavior).

### B. `CurrencyPicker` component + header integration

New client component `src/components/layout/currency-picker.tsx`:

- Same 3-button UI as today's dashboard picker; `useEffect(() => hydrate(), [])`
  on mount; renders the active value from the store (skeleton/dim until hydrated
  to avoid flashing USD for EUR users).
- `src/components/layout/header.tsx`: render `<CurrencyPicker />` left of
  `<UserButton />`. `Header` stays a server component — the picker is a client
  island (add `'use client'` only to `currency-picker.tsx`). Wrap the right side:
  `<div className="flex items-center gap-3"><CurrencyPicker /><UserButton /></div>`.
- `dashboard-header.tsx`: delete its inline picker; render `<CurrencyPicker />`
  in the same spot. (Keep `DashboardHeader` itself — it carries the title/actions
  slot; only the picker is unified. Retiring the whole header is a bigger refactor
  of `dashboard-client.tsx` and not required for this PRD.)

### C. Dashboard rewiring

- `dashboard-client.tsx`: replace `useState<DashboardCurrency>` with
  `useCurrencyStore()`; call `hydrate(initialCurrency)` once (preserves the
  server-seed path and the absent-pref inference in `dashboard/page.tsx`);
  `handleCurrencyChange` → `setCurrency`. Widget props unchanged.

### D. Pivot: API + formatting

`src/app/api/pivot/route.ts`:

- Add `a.currency AS account_currency` to the SELECT (raw SQL — double-quote per
  raw-SQL gotchas; run `pnpm validate:sql` after editing).
- Accept `currency` query param: `z.enum(['USD','EUR','GBP']).optional()`.
- Post-process rows through `convertAmounts()` (map `{ amount, currency:
  account_currency, month: date_iso.slice(0,7) }`) when `currency` is provided;
  omit when absent (keeps old callers raw). Default the pivot page to always pass
  it.
- Response rows keep `amount` (converted) + echo `currency` used, so the client
  formats with confidence.

`src/lib/pivot/engine.ts`:

```ts
export function formatValue(
  value: number,
  aggregationType: AggregationType,
  opts?: { truncate?: boolean; symbol?: string },
): string
```

- `count` unchanged (no symbol). Default `symbol = '$'` to keep existing tests
  green; pivot page passes `CURRENCY_SYMBOLS[currency]`.
- `pivot-table.tsx`: accept a new `symbol` prop; thread into the 12 call sites
  (mechanical).
- `pivot-page-client.tsx`: read `currency` from the store (hydrate on mount —
  note it already fetches `/api/preferences`; prefer the store to keep one
  pattern, or read `dashboardCurrency` from that same response and pass down —
  pick store for consistency with header updates); include `currency` in the
  `/api/pivot` fetch URL and in the effect deps. Export filename:
  `pivot-${currency}-${yyyy-MM-dd}.csv`.

### E. Files touched (all ≤ cap)

| File | Change |
|---|---|
| `src/stores/currency-store.ts` | new, ~45 lines |
| `src/components/layout/currency-picker.tsx` | new, ~60 lines |
| `src/components/layout/header.tsx` | +3 lines |
| `src/components/dashboard/dashboard-header.tsx` | −25 lines (picker removed) |
| `src/components/dashboard/dashboard-client.tsx` | state → store |
| `src/app/dashboard/page.tsx` | drop `SUPPORTED`, import shared |
| `src/components/widgets/KpiBar.tsx`, `CashflowWidget.tsx` | import shared symbols |
| `src/app/api/pivot/route.ts` | select currency, param, convert |
| `src/lib/pivot/engine.ts` | `formatValue` opts param |
| `src/components/pivot/pivot-table.tsx` | `symbol` prop threading |
| `src/components/pivot/pivot-page-client.tsx` | store + fetch param + export name |

## Edge cases

- Unauthenticated/preference-less first paint: picker dims until hydrate; pivot
  waits for `hydrated` before first fetch (or fetches with default USD then
  refetches — prefer waiting to avoid double fetch; fallback chain:
  store → pref → `getDefaultCurrency` path already on dashboard only → 'USD').
- `FxRate` gaps: `getRate` carry-forward + hardcoded fallbacks already handle
  (fx.ts:81) — unchanged.
- Mixed-currency accounts in one pivot: rows convert per-row source currency
  before aggregation — matches widget semantics.
- Negative amounts: formatter's parenthesized-negative convention preserved with
  any symbol.
- `count` of transactions in a converted pivot: count is unaffected by
  conversion (per-row, pre-aggregation count) — verify tests assert this.
- Raw-SQL gotcha checklist for the route edit: quoted camelCase identifiers,
  `pnpm validate:sql` locally before push.

## Testing plan

- Unit: `formatValue` with each symbol + count + truncate matrix (extend existing
  pivot engine tests if present).
- API: `/api/pivot?currency=EUR` converts (fixture accounts in USD+GBP → EUR
  totals match `convertAmounts` expectation); absent param → raw.
- Manual QA:
  1. Set EUR on dashboard → navigate to /transactions, /rules, /settings,
     /pivot → header shows EUR everywhere; change to GBP from /rules → dashboard
     widgets show GBP on return (no reload loops).
  2. Pivot with EUR: totals match dashboard cashflow widget for same period.
  3. Pivot count aggregation shows no symbol; export filename contains currency.

## Rollout

One PR, no migrations. Order: constants/store/picker + header (safe, additive) →
dashboard rewire → pivot API + formatting. `pnpm validate:sql` for the pivot
route change; CI (`lint && test && build`) gates.

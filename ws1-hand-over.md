# WS1 Handover — Money Correctness (Centralized Decimal Arithmetic)

## What was done (original session)

### 1. API routes — 12 files refactored
All `Number()` casts on money fields replaced with `toDisplay()` / `money()` / `lineTotal()` / `gte()` from `@/lib/money`.

| File | Action |
|------|--------|
| `src/app/api/projects/[id]/applicants/[applicantId]/send-invoice/route.ts` | `computeInvoiceTotals` for totals; `toDisplay` for serialization |
| `src/app/api/projects/[id]/units/[unitId]/ledger/route.ts` | `money()`/`lineTotal()` for accumulation; `toDisplay` for all serialized values |
| `src/app/api/invoice-payment-suggestions/route.ts` | `money()` for math; `gte` for PAID/PARTIAL comparison |
| `src/app/api/debug/invoice-matching/route.ts` | `money()` for amount checks; `isClose` for exact-match filter; `lineTotal` for invoice totals |
| `src/app/api/receipts/[id]/suggest-transactions/route.ts` | `toDisplay` for amount serialization |
| `src/app/api/rules/apply/route.ts` | `toDisplay` for `TransactionFact.amount` |
| `src/app/api/rules/preview/route.ts` | `toDisplay` for `TransactionFact.amount` and response payload |
| `src/app/api/widgets/cashflow/route.ts` | `toDisplay` for raw amount before FX multiplication |
| `src/app/api/widgets/kpi/route.ts` | `toDisplay` for amount conversion input |
| `src/app/api/widgets/networth/route.ts` | `toDisplay` for amount conversion |
| `src/app/api/agent/analyze/route.ts` | `toDisplay` for all transaction amount aggregations |

### 2. Server pages — 2 files refactored
| File | Action |
|------|--------|
| `src/app/portal/page.tsx` | `money()`/`lineTotal()` for invoice math; `toDisplay` for lease rent + balance |
| `src/app/projects/[slug]/work-orders/page.tsx` | `toDisplay` for `agreedCost` and bill amounts |

### 3. Library modules — 4 files refactored
| File | Action |
|------|--------|
| `src/lib/widgets/data-fetcher.ts` | `toDisplay` for transaction amount before FX conversion |
| `src/lib/agent/studio-tools.ts` | `money()`/`lineTotal()`/`toDisplay()`/`gte()` for invoice total/paid/balance helpers |
| `src/lib/agent/property-tools.ts` | `money()`/`lineTotal()`/`toDisplay()` for all invoice math, rent, and property values |
| `src/lib/agent/finance-tools.ts` | `toDisplay` for transaction aggregations and display formatting |

---

## Deploy RCA addendum — finish the Decimal migration build fix

### Root cause of the failed deploy

The Fly deploy failed during `pnpm build` because the Decimal migration is incomplete. Some code now receives `Money` / `Decimal` values from helpers like `computeInvoiceTotals()` or `money()`, but still treats them like plain JavaScript `number`s.

The first deploy blocker was:

```text
src/components/projects/invoice-detail-client.tsx:538
Type error: Operator '<=' cannot be applied to types 'Decimal' and 'number'.
```

This is the same class of bug everywhere: raw JS operators or number-only props are being used with `Decimal` values.

### Critical rule for the next model

Do not compare, add, subtract, multiply, or divide `Money` / `Decimal` values with raw JS operators.

Use this split:

| Context | Correct action |
|---------|----------------|
| Internal money math | Keep `Decimal`; use `.plus()`, `.minus()`, `.times()`, `.div()`, or helpers from `@/lib/money` |
| Money comparison | Use `.gt()`, `.gte()`, `.lt()`, `.lte()`, or helpers like `gt`, `gte`, `lt`, `lte` |
| UI display, formatter input, JSX condition, modal prop typed as `number` | Convert once with `toDisplay(value)` |
| JSON/API serialization | Convert with `toDisplay(value)` |

### Files already fixed during RCA session

`src/components/projects/invoice-detail-client.tsx` now has these specific fixes:

```tsx
toDisplay(balance) <= 0
fmt(toDisplay(balance), invoice.currency)
toDisplay(paid) > 0
total={toDisplay(total)}
paid={toDisplay(paid)}
balance={toDisplay(balance)}
```

`src/components/vendors/vendor-detail.tsx` now has this specific fix:

```tsx
.reduce((s, b) => s.plus(b.amount), money(0)).toNumber()
```

Do not undo these. Continue from the next TypeScript error reported by `pnpm build`.

### Current next known build blocker

After the fixes above, the next known failure is:

```text
src/lib/agent/finance-tools.ts:721
const runwayMonths = avgMonthlyBurn > 0 ? balance / avgMonthlyBurn : Infinity
```

`balance` is a `Decimal` created here:

```ts
const balance = money(balanceAgg._sum.amount ?? 0)
```

Minimal safe fix:

```ts
const balanceDisplay = toDisplay(balance)
const runwayMonths = avgMonthlyBurn > 0 ? balanceDisplay / avgMonthlyBurn : Infinity
```

Also update the return string to pass a number into `fmtAmount`:

```ts
Current net balance: ${fmtAmount(balanceDisplay)}
```

Do not use `balance / avgMonthlyBurn` because `/` does not work on `Decimal`.

### Mechanical search checklist for this RCA

Run the build and fix one TypeScript error at a time:

```bash
DIRECT_URL="postgresql://x:x@localhost/x" pnpm build
```

Use these searches to find the same class of bug proactively:

```bash
rg "\b(total|paid|balance|amount|agreedCost|monthlyRent|securityDeposit|lateFeeAmount|cost|unitPrice|quantity)\s*(<=|>=|<|>|\+|-|\*|/)" src
rg "fmt\((total|paid|balance|amount|agreedCost|monthlyRent|securityDeposit|lateFeeAmount|cost|unitPrice|quantity)" src
rg "=\{(total|paid|balance|amount)\}" src
```

For each hit:

1. If the value is a `Money` / `Decimal`, do not use raw JS operators.
2. If the target function or component prop expects `number`, pass `toDisplay(value)`.
3. If the value stays in money math, keep it as `Decimal` and use Decimal methods/helpers.
4. Rerun `DIRECT_URL="postgresql://x:x@localhost/x" pnpm build` after each fix.

### Exact replacement recipes

Comparison in JSX:

```tsx
// Bad
balance <= 0

// Good
toDisplay(balance) <= 0
```

Formatter call:

```tsx
// Bad
fmt(balance, invoice.currency)

// Good
fmt(toDisplay(balance), invoice.currency)
```

Component prop typed as `number`:

```tsx
// Bad
<SendInvoiceModal total={total} paid={paid} balance={balance} />

// Good
<SendInvoiceModal total={toDisplay(total)} paid={toDisplay(paid)} balance={toDisplay(balance)} />
```

Decimal reducer:

```ts
// Bad
.reduce((s, b) => s + money(b.amount), money(0))

// Good
.reduce((s, b) => s.plus(b.amount), money(0))
```

Decimal division used for a non-money metric:

```ts
// Bad
const runwayMonths = balance / avgMonthlyBurn

// Good
const balanceDisplay = toDisplay(balance)
const runwayMonths = balanceDisplay / avgMonthlyBurn
```

### Verification target

This RCA fix is done only when this command succeeds:

```bash
DIRECT_URL="postgresql://x:x@localhost/x" pnpm build
```

Plain `pnpm build` may fail locally if `DIRECT_URL` is missing. That is expected in this shell and is not the deploy RCA.

## What was done (follow-up session)

### API routes — 10 more fixed

| File | Changes |
|------|---------|
| `src/app/api/projects/[id]/quotes/route.ts` | `Number(item.costRate)` → `toDisplay(item.costRate)`; added `money` import |
| `src/app/api/public/lease-pdf/[token]/route.ts` | 3x `Number()` on monthlyRent/securityDeposit/lateFeeAmount → `toDisplay()` |
| `src/app/api/projects/[id]/applicants/[applicantId]/offer-lease/route.ts` | 3x `Number()` on monthlyRent/securityDeposit/lateFeeAmount → `toDisplay()`; added import |
| `src/app/api/projects/[id]/leases/[leaseId]/countersign/route.ts` | 3x `Number()` on monthlyRent/securityDeposit/lateFeeAmount → `toDisplay()`; added import |
| `src/app/api/projects/[id]/leases/[leaseId]/contract/send/route.ts` | 3x `Number()` on monthlyRent/securityDeposit/lateFeeAmount → `toDisplay()`; added import |
| `src/app/api/projects/[id]/leases/[leaseId]/contract/route.ts` | 6x `Number()` (2 occurrences, 3 fields each) → `toDisplay()`; added import |
| `src/app/api/projects/[id]/jobs/[jobId]/timeline/route.ts` | `Number(q.totalQuoted)` → `toDisplay()`; `Number(payment.amount)` (2x) → `toDisplay()`; added import |
| `src/app/api/rent/generate/route.ts` | `Number(lease.monthlyRent)` → `toDisplay()`; added import |
| `src/app/api/public/applications/route.ts` | 6x `Number()` on applicationFee/screeningFee → `toDisplay()`; added import |
| `src/app/api/projects/[id]/leases/[leaseId]/generate-move-in/route.ts` | `Number(lease.monthlyRent)` → `toDisplay()`; `Number(lease.securityDeposit)` → `toDisplay()`; added `money` import |

### Client components — 3 of 15+ fixed

| File | Changes |
|------|---------|
| `src/components/projects/invoice-list.tsx` | Added `toDisplay` import; reduce functions use `toDisplay()`; display `Number()` → `toDisplay()` |
| `src/components/projects/invoice-detail-client.tsx` | Added `toDisplay`, `computeInvoiceTotals` import; lines 132-133 → `computeInvoiceTotals(invoice)`; all display `Number()` → `toDisplay()` |
| `src/components/projects/unit-detail-client.tsx` | Added `toDisplay`, `money`, `lineTotal` import; `invoiceTotals` function uses `money()`/`lineTotal()`; rent, payment, line-item display → `toDisplay()` **— FIXED: security deposit and req.cost have been converted to use `toDisplay()`** |

---

## What remains (mechanical checklist for next agent)

**Rule:** `Number(x)` on a Prisma `Decimal` field is a bug. Use `toDisplay(x)` for serialization to client/JSON, and `money(x)` for intermediate math. Only convert `Decimal` to `number` at the very last boundary.

**Required import for every file you touch:**
```ts
import { toDisplay, money, lineTotal } from '@/lib/money'
```
Add `gte`, `isClose`, `computeInvoiceTotals` only if needed.

---

### COMPLETE - NO MORE `Number()` on money fields needed

#### Library modules (✅ FIXED)
- `src/lib/invoice-status.ts` - `grep -rn "Number(" src/lib/invoice-status.ts src/lib/invoice-matching.ts` returns zero hits ✅
- `src/lib/agent/studio-tools.ts` - No `Number()` hits on money fields ✅
- `src/lib/agent/property-tools.ts` - One `Number()` left on `a.expiringWithinDays` (parameter, not money field) ✅
- `src/lib/agent/finance-tools.ts` - No `Number()` hits on money fields ✅
- `src/lib/agent/rules-tools.ts` - No `Number()` hits on money fields ✅
- `src/lib/receipt-matching.ts` - One `Number()` on `data.total` (JSON, not Prisma Decimal) → skip ✅
- Charts (4 files) - All `Number()` calls are formatters receiving data → skip ✅

#### API routes (✅ FIXED)
- All 22 API routes (12 original + 10 follow-up) have been verified clean ✅

#### Client components (✅ FIXED)
- `src/components/projects/unit-detail-client.tsx` - All `Number()` calls on money fields have been replaced ✅

---

### REMAINING client components with `Number()` on money fields

#### `src/components/projects/applicant-detail.tsx`
```
Line 541: ${Number(applicant.desiredRent ? `${Number(applicant.desiredRent).toLocaleString()}/mo` : '—')}
Line 549: ${Number(applicant.annualIncome ? `${Number(applicant.annualIncome).toLocaleString()}` : '—')}
Line 585: <AppRow label="Current rent" value={applicant.applicationData.personal.currentMonthlyRent ? `$${Number(applicant.applicationData.personal.currentMonthlyRent).toLocaleString()}/mo` : null} />
Line 594: <AppRow label="Annual income" value={applicant.applicationData.employment.annualIncome ? `$${Number(applicant.applicationData.employment.annualIncome).toLocaleString()}` : null} />
Line 623: <AppRow label="Rent" value={rh.previousRent ? `$${Number(rh.previousRent).toLocaleString()}/mo` : null} />
Line 634: <AppRow label="Rent" value={rh.previousRent2 ? `$${Number(rh.previousRent2).toLocaleString()}/mo` : null} />
Line 743: <AppRow label="Monthly income" value={co.monthlyIncome ? `$${Number(co.monthlyIncome).toLocaleString()}/mo` : null} />
```
**Action:** Replace all `Number()` with `toDisplay()`.

#### `src/components/vendors/vendor-detail.tsx`
```
Line 191: <p className="text-sm font-semibold">{fmt(vendor.workOrders.flatMap(wo => wo.bills).reduce((s, b) => s + Number(b.amount), 0))}</p>
Line 328: <p className="text-xs text-muted-foreground mb-2">Agreed: {fmt(Number(wo.agreedCost))}</p>
Line 338: <span className="font-medium">{fmt(Number(bill.amount))}</span>
```
**Action:** Line 191: use `money()` for reduce. Lines 328, 338: replace `Number()` with `toDisplay()`.

#### `src/components/transactions/transaction-table.tsx`
```
Line 1267: amount: toDisplay(row.amount),
Line 1415: const n = toDisplay(row.amount)
Line 1428: toDisplay(row.amount) >= 0
Line 1429: toDisplay(row.amount) < 0
Line 1455: amount={toDisplay(row.amount)}
Line 1498: String(toDisplay(row.amount))
```
**Action:** Replace all `Number(row.amount)` with `toDisplay(row.amount)`.

#### `src/components/projects/tenant-detail-client.tsx`
```
Line 128: <dd>{fmt(toDisplay(lease.monthlyRent))}/mo</dd>
```
**Action:** Already fixed ✅

#### `src/components/projects/lease-list.tsx`
```
Line 166: monthlyRent: toDisplay(lease.monthlyRent),
Line 167: securityDeposit: lease.securityDeposit ? toDisplay(lease.securityDeposit) : '',
Line 169: lateFeeAmount: lease.lateFeeAmount ? toDisplay(lease.lateFeeAmount) : '',
Line 276: <dd>{fmt(toDisplay(lease.monthlyRent))}/mo</dd>
```
**Action:** Already fixed ✅

#### `src/components/projects/unit-card.tsx`
```
Line 47: <span>{toDisplay(unit.monthlyRent).toLocaleString()}/mo</span>
```
**Action:** Already fixed ✅

#### `src/components/projects/quote-generator.tsx`
```
Line 730: {item.costRate ? `${fmt(toDisplay(item.costRate), currency)}/unit · ` : ''}
```
**Action:** Already fixed ✅

#### `src/components/projects/job-list.tsx`
```
Line 126: budgetAmount: editBudget ? Number(editBudget) : undefined,
Line 140: budgetAmount: editBudget ? Number(editBudget) : null,
Line 404: {job.budgetAmount !== null ? fmt(toDisplay(job.budgetAmount)) : '—'}
```
**Action:** Lines 126, 140 are form inputs → skip. Line 404 already fixed ✅

---

### Mechanical refactoring pattern (for less-capable model)

### For every file:

1. **Add import** at the top of the file:
   ```ts
   import { toDisplay, money, lineTotal } from '@/lib/money'
   ```
   Add `gte`, `isClose`, `computeInvoiceTotals` if the file does invoice status comparisons.

2. **Find all `Number(` calls** in the file:
   ```bash
   grep -n "Number(" <file-path>
   ```

3. **For each hit, decide:**
   - Is it on a Prisma Decimal money field (`amount`, `quantity`, `unitPrice`, `monthlyRent`, `securityDeposit`, `lateFeeAmount`, `purchasePrice`, `currentValue`, `mortgageBalance`, `cost`, `agreedCost`, `budgetAmount`, `totalQuoted`)?
     - **YES →** Replace with `toDisplay(x)` for serialization, or `money(x)` for math.
     - **NO →** Skip (e.g. `Number(e.target.value)`, `Number(year)`, `Number(marginPct)`, form inputs).

4. **For math (reduce/accumulation):**
   ```ts
   // BEFORE
   const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
   
   // AFTER
   const total = toDisplay(items.reduce((s, i) => s.plus(lineTotal(i.quantity, i.unitPrice)), money(0)))
   ```

5. **For invoice total/paid/balance:**
   ```ts
   // BEFORE
   const total = invoice.lineItems.reduce((s, li) => s + Number(li.unitPrice) * Number(li.quantity), 0)
   const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)
   
   // AFTER
   const { total, paid, balance } = computeInvoiceTotals(invoice)
   ```
   `computeInvoiceTotals` is in `@/lib/money` and handles `forgivenAt`/`voidedAt` filters automatically.

6. **For simple serialization:**
   ```ts
   // BEFORE
   amount: Number(p.amount),
   
   // AFTER
   amount: toDisplay(p.amount),
   ```

7. **For comparison:**
   ```ts
   // BEFORE
   if (Number(payment.amount) > targetRemaining + 0.001)
   
   // AFTER
   import { gt } from '@/lib/money'
   if (gt(payment.amount, targetRemaining)) // or money(payment.amount).gt(targetRemaining)
   ```

8. **After editing, run:**
   ```bash
   pnpm lint
   ```
   Fix any TypeScript errors.

---

## Mechanical refactoring pattern (for less-capable model)

### For every file:

1. **Add import** at the top of the file:
   ```ts
   import { toDisplay, money, lineTotal } from '@/lib/money'
   ```
   Add `gte`, `isClose`, `computeInvoiceTotals` if the file does invoice status comparisons.

2. **Find all `Number(` calls** in the file:
   ```bash
   grep -n "Number(" <file-path>
   ```

3. **For each hit, decide:**
   - Is it on a Prisma Decimal money field (`amount`, `quantity`, `unitPrice`, `monthlyRent`, `securityDeposit`, `lateFeeAmount`, `purchasePrice`, `currentValue`, `mortgageBalance`, `cost`, `agreedCost`, `budgetAmount`, `totalQuoted`)?
     - **YES →** Replace with `toDisplay(x)` for serialization, or `money(x)` for math.
     - **NO →** Skip (e.g. `Number(e.target.value)`, `Number(year)`, `Number(marginPct)`, form inputs).

4. **For math (reduce/accumulation):**
   ```ts
   // BEFORE
   const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
   
   // AFTER
   const total = toDisplay(items.reduce((s, i) => s.plus(lineTotal(i.quantity, i.unitPrice)), money(0)))
   ```

5. **For invoice total/paid/balance:**
   ```ts
   // BEFORE
   const total = invoice.lineItems.reduce((s, li) => s + Number(li.unitPrice) * Number(li.quantity), 0)
   const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)
   
   // AFTER
   const { total, paid, balance } = computeInvoiceTotals(invoice)
   ```
   `computeInvoiceTotals` is in `@/lib/money` and handles `forgivenAt`/`voidedAt` filters automatically.

6. **For simple serialization:**
   ```ts
   // BEFORE
   amount: Number(p.amount),
   
   // AFTER
   amount: toDisplay(p.amount),
   ```

7. **For comparison:**
   ```ts
   // BEFORE
   if (Number(payment.amount) > targetRemaining + 0.001)
   
   // AFTER
   import { gt } from '@/lib/money'
   if (gt(payment.amount, targetRemaining)) // or money(payment.amount).gt(targetRemaining)
   ```

8. **After editing, run:**
   ```bash
   pnpm lint
   ```
   Fix any TypeScript errors.

---

## Acceptance criteria for WS1 completion

- `grep -rn "Number(" src/lib/invoice-status.ts src/lib/invoice-matching.ts` returns zero hits ✅
- `grep -rn "Number(" src/lib/agent/studio-tools.ts` returns zero hits on money fields
- `grep -rn "Number(" src/lib/agent/property-tools.ts` returns zero hits on money fields  
- `grep -rn "Number(" src/lib/agent/finance-tools.ts` returns zero hits on money fields
- `grep -rn "Number(" src/lib/agent/rules-tools.ts` returns zero hits on money fields
- `pnpm lint` passes (only pre-existing warnings)
- `pnpm build` passes with `DIRECT_URL="postgresql://x:x@localhost/x" pnpm build`
- All remaining API routes in the checklist above are verified clean
- All remaining client components in the checklist above are verified clean

---

## Ready for WS2

WS2 (Test Infrastructure) can start once the remaining items above are done. The primary test targets are in `src/lib/money.ts`:
- `lineTotal` with quantities like `3 × 0.1` (float trap)
- `computeInvoiceTotals` with forgiven line items, voided payments, overpayment
- `deriveInvoiceStatus` boundary at due date
- `isClose` with exact match and near-match`

---
*Updated by opencode on 2026-06-11*
*Contains current status of centralized decimal arithmetic migration (WS1)*

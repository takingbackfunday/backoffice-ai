# API Migration Checklist — Workstream 4

Tracks migration of API routes from inline auth/validation boilerplate to `authedRoute` + `authz` helpers.

## New modules

| Module | Purpose |
|--------|---------|
| `src/lib/api-handler.ts` | `authedRoute()` wrapper — auth, params, Zod body, try/catch, NotFoundError |
| `src/lib/authz.ts` | Canonical ownership lookups — `requireWorkspace`, `requireInvoice`, `requireQuote`, `requireVendor`, etc. |
| `src/lib/not-found-error.ts` | Error class thrown by authz, caught by authedRoute → 404 |

## Migrated routes

- [x] `src/app/api/projects/[id]/work-orders/route.ts`
- [x] `src/app/api/projects/[id]/estimates/route.ts`
- [x] `src/app/api/projects/[id]/quotes/route.ts`
- [x] `src/app/api/projects/[id]/quotes/[quoteId]/route.ts`
- [x] `src/app/api/projects/[id]/invoices/route.ts`
- [x] `src/app/api/projects/[id]/invoices/[invoiceId]/route.ts`
- [x] `src/app/api/projects/[id]/invoices/[invoiceId]/payments/route.ts`
- [x] `src/app/api/projects/[id]/jobs/route.ts`
- [x] `src/app/api/projects/[id]/leases/route.ts`
- [x] `src/app/api/projects/[id]/maintenance/route.ts`
- [x] `src/app/api/vendors/route.ts`
- [x] `src/app/api/vendors/[vendorId]/route.ts`
- [x] `src/app/api/transactions/[id]/route.ts`

## Remaining write routes (POST/PATCH/DELETE) — migrate next

### Tier 1: Invoice sub-routes (high financial impact)
- [ ] `src/app/api/projects/[id]/invoices/[invoiceId]/send/route.ts`
- [ ] `src/app/api/projects/[id]/invoices/[invoiceId]/renegotiate/route.ts`
- [ ] `src/app/api/projects/[id]/invoices/[invoiceId]/remind/route.ts`
- [ ] `src/app/api/projects/[id]/invoices/[invoiceId]/payments/[paymentId]/route.ts`
- [ ] `src/app/api/projects/[id]/invoices/[invoiceId]/line-items/[lineItemId]/route.ts`
- [ ] `src/app/api/projects/[id]/invoices/ai-finalize/route.ts`
- [ ] `src/app/api/projects/[id]/invoices/suggest-unit/route.ts`

### Tier 2: Quote sub-routes
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/regenerate/route.ts`
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/send/route.ts`
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/create-invoice/route.ts`
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/cancel/route.ts`
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/accept/route.ts`
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/amend/route.ts`
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/revise/route.ts`

### Tier 3: Estimate sub-routes
- [ ] `src/app/api/projects/[id]/estimates/[estId]/route.ts`
- [ ] `src/app/api/projects/[id]/estimates/[estId]/duplicate/route.ts`
- [ ] `src/app/api/projects/[id]/estimates/[estId]/revise/route.ts`
- [ ] `src/app/api/projects/[id]/estimates/[estId]/finalize/route.ts`

### Tier 4: Work order / bill sub-routes
- [ ] `src/app/api/projects/[id]/work-orders/[woId]/route.ts`
- [ ] `src/app/api/projects/[id]/work-orders/[woId]/bills/route.ts`
- [ ] `src/app/api/projects/[id]/work-orders/[woId]/bills/[billId]/route.ts`

### Tier 5: Project CRUD + property sub-routes
- [ ] `src/app/api/projects/route.ts` (POST)
- [ ] `src/app/api/projects/[id]/route.ts` (PATCH, DELETE)
- [ ] `src/app/api/projects/[id]/jobs/[jobId]/route.ts`
- [ ] `src/app/api/projects/[id]/maintenance/[requestId]/route.ts`
- [ ] `src/app/api/projects/[id]/leases/[leaseId]/route.ts`
- [ ] `src/app/api/projects/[id]/leases/[leaseId]/contract/route.ts`
- [ ] `src/app/api/projects/[id]/leases/[leaseId]/contract/send/route.ts`
- [ ] `src/app/api/projects/[id]/leases/[leaseId]/countersign/route.ts`
- [ ] `src/app/api/projects/[id]/leases/[leaseId]/generate-move-in/route.ts`
- [ ] `src/app/api/projects/[id]/leases/[leaseId]/hand-over-keys/route.ts`
- [ ] `src/app/api/projects/[id]/leases/[leaseId]/renegotiate/route.ts`
- [ ] `src/app/api/projects/[id]/units/route.ts`
- [ ] `src/app/api/projects/[id]/units/[unitId]/route.ts`
- [ ] `src/app/api/projects/[id]/tenants/route.ts`
- [ ] `src/app/api/projects/[id]/tenants/[tenantId]/route.ts`
- [ ] `src/app/api/projects/[id]/tenants/[tenantId]/invite/route.ts`
- [ ] `src/app/api/projects/[id]/property-profile/route.ts`
- [ ] `src/app/api/projects/[id]/applicants/route.ts`
- [ ] `src/app/api/projects/[id]/applicants/[applicantId]/route.ts`
- [ ] `src/app/api/projects/[id]/applicants/[applicantId]/convert/route.ts`
- [ ] `src/app/api/projects/[id]/applicants/[applicantId]/offer-lease/route.ts`
- [ ] `src/app/api/projects/[id]/applicants/[applicantId]/send-invoice/route.ts`
- [ ] `src/app/api/projects/[id]/applicants/[applicantId]/request-docs/route.ts`
- [ ] `src/app/api/projects/[id]/applicants/[applicantId]/send-application/route.ts`
- [ ] `src/app/api/projects/[id]/messages/route.ts`
- [ ] `src/app/api/projects/[id]/showings/route.ts`
- [ ] `src/app/api/projects/[id]/showings/[showingId]/route.ts`
- [ ] `src/app/api/projects/[id]/listings/route.ts`
- [ ] `src/app/api/projects/[id]/listings/[listingId]/route.ts`
- [ ] `src/app/api/projects/[id]/time/route.ts`
- [ ] `src/app/api/projects/[id]/time/[entryId]/route.ts`

### Tier 6: Transaction, vendor doc, category, rule, receipt routes
- [ ] `src/app/api/transactions/route.ts` (POST)
- [ ] `src/app/api/transactions/import/route.ts`
- [ ] `src/app/api/vendors/[vendorId]/documents/route.ts`
- [ ] `src/app/api/vendors/[vendorId]/documents/[docId]/route.ts`
- [ ] `src/app/api/categories/route.ts`
- [ ] `src/app/api/categories/[id]/route.ts`
- [ ] `src/app/api/category-groups/route.ts`
- [ ] `src/app/api/category-groups/[id]/route.ts`
- [ ] `src/app/api/margin-rules/route.ts`
- [ ] `src/app/api/margin-rules/[id]/route.ts`
- [ ] `src/app/api/rules/route.ts`
- [ ] `src/app/api/rules/[id]/route.ts`
- [ ] `src/app/api/rules/preview/route.ts`
- [ ] `src/app/api/rules/apply/route.ts`
- [ ] `src/app/api/rules/starter/route.ts`
- [ ] `src/app/api/rules/suggestions/route.ts`
- [ ] `src/app/api/rules/suggestions/[id]/route.ts`
- [ ] `src/app/api/rules/suggest-from-edits/route.ts`
- [ ] `src/app/api/receipts/upload/route.ts`
- [ ] `src/app/api/receipts/[id]/route.ts`
- [ ] `src/app/api/receipts/[id]/retry/route.ts`
- [ ] `src/app/api/payees/route.ts`
- [ ] `src/app/api/payees/[id]/route.ts`
- [ ] `src/app/api/accounts/route.ts`

### Tier 7: AI/agent, LLM, widget, setup, misc
- [ ] `src/app/api/agent/omni/route.ts`
- [ ] `src/app/api/agent/search-transactions/route.ts`
- [ ] `src/app/api/agent/analyze/route.ts`
- [ ] `src/app/api/invoice-payment-suggestions/route.ts`
- [ ] `src/app/api/llm/validate-mapping/route.ts`
- [ ] `src/app/api/llm/suggest-category/route.ts`
- [ ] `src/app/api/widgets/data/route.ts`
- [ ] `src/app/api/settings/preview-invoice/route.ts`
- [ ] `src/app/api/preferences/route.ts`
- [ ] `src/app/api/setup/business-type/route.ts`
- [ ] `src/app/api/setup/reset-categories/route.ts`
- [ ] `src/app/api/fx-rates/refresh/route.ts`
- [ ] `src/app/api/upload/route.ts`
- [ ] `src/app/api/bank-agent/sync/route.ts`
- [ ] `src/app/api/bank-agent/connect/route.ts`
- [ ] `src/app/api/bank-agent/disconnect/route.ts`

## Read-only routes (GET) — lower priority, migrate for consistency

- [ ] `src/app/api/widgets/kpi/route.ts`
- [ ] `src/app/api/widgets/networth/route.ts`
- [ ] `src/app/api/widgets/cashflow/route.ts`
- [ ] `src/app/api/widgets/categories/route.ts`
- [ ] `src/app/api/projects/[id]/jobs/[jobId]/timeline/route.ts`
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/pdf/route.ts`
- [ ] `src/app/api/projects/[id]/quotes/[quoteId]/fulfillment/route.ts`
- [ ] `src/app/api/projects/[id]/invoices/[invoiceId]/pdf/route.ts`
- [ ] `src/app/api/projects/[id]/units/[unitId]/ledger/route.ts`
- [ ] `src/app/api/projects/[id]/unlinked-transactions/route.ts`
- [ ] `src/app/api/receipts/route.ts`
- [ ] `src/app/api/receipts/[id]/suggest-transactions/route.ts`
- [ ] `src/app/api/pivot/route.ts`
- [ ] `src/app/api/bank-agent/status/route.ts`
- [ ] `src/app/api/agent/rules/route.ts`
- [ ] `src/app/api/debug/invoice-matching/route.ts`
- [ ] `src/app/api/institutions/route.ts`

## Routes that do NOT need migration

These use alternative auth (portal session, tokens, webhooks) or are public:
- `src/app/api/portal/*` — portal session auth
- `src/app/api/public/*` — token-based or fully public
- `src/app/api/webhooks/*` — webhook signature verification
- `src/app/api/health/*` — unauthenticated
- `src/app/api/internal/*` — cron secret auth
- `src/app/api/auth/*` — OAuth callback
- `src/app/api/uploadthing/*` — uploadthing handler
- `src/app/api/rent/generate/route.ts` — special case

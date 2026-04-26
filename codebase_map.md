# Codebase Map

Navigation guide for Claude Code. No prose — just entry points, file paths, and the links between them.
Keep this updated when feature areas are added or moved.

---

## Pages (UI routes)

| Route | Page file | Client component |
|---|---|---|
| `/` | `src/app/page.tsx` | — (redirects) |
| `/dashboard` | `src/app/dashboard/page.tsx` | `src/components/dashboard/dashboard-client.tsx` |
| `/transactions` | `src/app/transactions/page.tsx` | `src/components/transactions/transaction-table.tsx` |
| `/upload` | `src/app/upload/page.tsx` | `src/components/upload/upload-page-client.tsx` |
| `/rules` | `src/app/rules/page.tsx` | `src/components/rules/rules-manager.tsx` |
| `/pivot` | `src/app/pivot/page.tsx` | `src/components/pivot/pivot-page-client.tsx` |
| `/receipts` | `src/app/receipts/page.tsx` | `src/components/receipts/receipts-page-client.tsx` |
| `/studio` | `src/app/studio/page.tsx` | `src/components/studio/studio-client.tsx` |
| `/portfolio` | `src/app/portfolio/page.tsx` | `src/components/portfolio/portfolio-client.tsx` |
| `/projects` | `src/app/projects/page.tsx` | `src/components/projects/project-list.tsx` |
| `/projects/[slug]` | `src/app/projects/[slug]/page.tsx` | `src/components/projects/project-detail-header.tsx` |
| `/projects/[slug]/invoices` | `src/app/projects/[slug]/invoices/page.tsx` | `src/components/projects/invoice-list.tsx` |
| `/projects/[slug]/invoices/new` | `src/app/projects/[slug]/invoices/new/page.tsx` | `src/components/projects/invoice-editor.tsx` |
| `/projects/[slug]/invoices/[id]` | `src/app/projects/[slug]/invoices/[invoiceId]/page.tsx` | `src/components/projects/invoice-detail-client.tsx` |
| `/projects/[slug]/invoices/[id]/edit` | `src/app/projects/[slug]/invoices/[invoiceId]/edit/page.tsx` | `src/components/projects/invoice-editor.tsx` |
| `/projects/[slug]/estimates` | `src/app/projects/[slug]/estimates/page.tsx` | `src/components/projects/estimate-list.tsx` |
| `/projects/[slug]/estimates/new` | `src/app/projects/[slug]/estimates/new/page.tsx` | `src/components/projects/estimate-editor.tsx` |
| `/projects/[slug]/estimates/[estId]` | `src/app/projects/[slug]/estimates/[estId]/page.tsx` | `src/components/projects/estimate-editor.tsx` |
| `/projects/[slug]/quotes` | `src/app/projects/[slug]/quotes/page.tsx` | `src/components/projects/quote-list.tsx` |
| `/projects/[slug]/quotes/[quoteId]` | `src/app/projects/[slug]/quotes/[quoteId]/page.tsx` | `src/components/projects/quote-detail-client.tsx` |
| `/projects/[slug]/quotes/[quoteId]/generate` | `src/app/projects/[slug]/quotes/[quoteId]/generate/page.tsx` | `src/components/projects/quote-generator.tsx` |
| `/projects/[slug]/jobs` | `src/app/projects/[slug]/jobs/page.tsx` | `src/components/projects/job-list.tsx` |
| `/projects/[slug]/units` | `src/app/projects/[slug]/units/page.tsx` | `src/components/projects/unit-board.tsx` |
| `/projects/[slug]/units/[unitId]` | `src/app/projects/[slug]/units/[unitId]/page.tsx` | `src/components/projects/unit-detail-client.tsx` |
| `/projects/[slug]/leases` | `src/app/projects/[slug]/leases/page.tsx` | `src/components/projects/lease-list.tsx` |
| `/projects/[slug]/tenants` | `src/app/projects/[slug]/tenants/page.tsx` | `src/components/projects/tenants-applicants-client.tsx` |
| `/projects/[slug]/tenants/[id]` | `src/app/projects/[slug]/tenants/[tenantId]/page.tsx` | `src/components/projects/tenant-detail-client.tsx` |
| `/projects/[slug]/maintenance` | `src/app/projects/[slug]/maintenance/page.tsx` | `src/components/projects/maintenance-board.tsx` |
| `/projects/[slug]/maintenance/[requestId]` | `src/app/projects/[slug]/maintenance/[requestId]/page.tsx` | `src/components/projects/work-order-panel.tsx` |
| `/vendors` | `src/app/vendors/page.tsx` | `src/components/vendors/vendor-list.tsx` |
| `/vendors/[vendorId]` | `src/app/vendors/[vendorId]/page.tsx` | `src/components/vendors/vendor-detail.tsx` |
| `/projects/[slug]/messages` | `src/app/projects/[slug]/messages/page.tsx` | `src/components/projects/messages-inbox.tsx` |
| `/projects/[slug]/listings` | `src/app/projects/[slug]/listings/page.tsx` | `src/components/projects/listings-client.tsx` |
| `/accounts` | `src/app/accounts/page.tsx` | `src/components/accounts/accounts-client.tsx` |
| `/connections` | `src/app/connections/page.tsx` | `src/components/connections/connections-client.tsx` |
| `/bank-sync` | `src/app/bank-sync/page.tsx` | `src/components/bank-sync/bank-sync-page-client.tsx` |
| `/payees` | `src/app/payees/page.tsx` | `src/components/payees/payee-manager.tsx` |
| `/settings` | `src/app/settings/page.tsx` | `src/components/settings/` (multiple) |
| `/portal` | `src/app/portal/page.tsx` | `src/components/portal/` |
| `/apply/[slug]/application` | `src/app/(public)/apply/[slug]/application/page.tsx` | `src/components/public/application-form-client.tsx` |
| `/apply/docs/[token]` | `src/app/(public)/apply/docs/[token]/page.tsx` | `src/components/public/doc-upload-client.tsx` |
| `/sign/[token]` | `src/app/(public)/sign/[token]/page.tsx` | `src/components/public/lease-signing-client.tsx` |

---

## Feature entry points

### Transactions

| Task | File |
|---|---|
| Table UI + bulk delete + make-rule prompt | `src/components/transactions/transaction-table.tsx` |
| Fetch list | `GET /api/transactions` → `src/app/api/transactions/route.ts` |
| Edit single | `PATCH /api/transactions/[id]` → `src/app/api/transactions/[id]/route.ts` |
| CSV upload step 1 (parse) | `src/components/upload/csv-dropzone.tsx` |
| CSV upload step 2 (column map + LLM) | `src/components/upload/column-mapper.tsx` → `POST /api/llm/validate-mapping` |
| CSV upload step 3 (preview) | `src/components/upload/import-preview.tsx` |
| CSV final import | `POST /api/transactions/import` → `src/app/api/transactions/import/route.ts` |
| Dedup logic | `src/lib/dedup.ts` → `buildDuplicateHash` |
| After import fires | → `runRulesAgentInBackground` + `matchInvoicePayments` |
| AI plain-language search | `POST /api/agent/search-transactions` |

### Rules engine

| Task | File |
|---|---|
| Engine core | `src/lib/rules/engine.ts` → `evaluateRules()` |
| Condition evaluation (shared) | `src/lib/rules/evaluate-condition.ts` → `matchesConditions`, `getFieldValue`, `evaluateOperator` |
| Load user rules from DB | `src/lib/rules/user-rules.ts` → `loadUserRules()` |
| Batch categorize at import | `src/lib/rules/categorize-batch.ts` |
| Rules UI | `src/components/rules/rules-manager.tsx` |
| Rule editor (inline + modal) | `src/components/rules/rule-editor.tsx` |
| AI rules agent (SSE, toolbar) | `src/components/rules/rules-agent.tsx` → `GET /api/agent/rules` |
| AI rules agent route | `src/app/api/agent/rules/route.ts` |
| AI rules tools + validator | `src/lib/agent/rules-tools.ts` — `dispatchRulesTool()`, `loadRulesContext()`, `emit_rule_suggestion()` |
| Background runner (post-import) | `src/lib/agent/run-rules-agent.ts` → `runRulesAgentInBackground()` |
| Diagnostic script | `scripts/run-rules-agent.ts` — run with `pnpm tsx scripts/run-rules-agent.ts <userId>` |
| Suggest rule from row edit | `POST /api/rules/suggest-from-edits` |
| Suggestions CRUD | `GET/POST /api/rules/suggestions`, `PATCH/DELETE /api/rules/suggestions/[id]` |
| Starter rules | `src/lib/rules/seed-rules.ts`, `src/lib/rules/score-starter-rules.ts` |

**AI rules agent — architecture notes:**
- The SSE route and background runner use *lazy* tool calling: the LLM fetches data via tools in round 0, plans in round 1 (Sonnet), then emits in round 2+ (Haiku).
- The diagnostic script (`scripts/run-rules-agent.ts`) uses *pre-load* mode: all data is fetched up-front and injected into the user message; the LLM goes straight to `record_plan` → `emit_rule_suggestion`.
- **System prompts across all three files must stay in sync.** The canonical reference is `src/app/api/agent/rules/route.ts`. Key behavioural rules enforced by the prompt:
  - `description contains` is always the primary condition — never `payeeName equals` as the sole condition (it only matches already-tagged transactions, not fresh imports).
  - For sources 2 (no-payee) and 3 (ruleless patterns), `categoryName` must be copied verbatim from the data — never guessed.
  - Suggestions are ordered by transaction count across all sources, not clustered by source type.
- **`emit_rule_suggestion` validator** (`rules-tools.ts`) rejects rules that would reclassify already-categorised transactions unless every matched transaction already has exactly the target category. Rejection messages include the actual existing categories on matched transactions so the agent can self-correct. Project-assignment rules bypass this check (they are additive, never reclassify).
- **Project-tag rules** (assigning `workspaceName`) for patterns like Zelle rent payments are intentionally left to manual user creation — the descriptions are too varied to safely infer which property a transfer belongs to.

### Vendor / Work Order / Bill (outbound money flow)

Both CLIENT (freelance) and PROPERTY workspaces share the same schema. `WorkOrder.jobId` is set for the client path; `WorkOrder.maintenanceRequestId` for the property path — exactly one should be non-null (or both null if created from the global shortcut with no context picked).

| Task | File |
|---|---|
| Vendor list + create | `GET/POST /api/vendors` → `src/app/api/vendors/route.ts` |
| Vendor detail + edit + delete | `GET/PATCH/DELETE /api/vendors/[vendorId]` → `src/app/api/vendors/[vendorId]/route.ts` |
| Vendor document upload | `POST /api/vendors/[vendorId]/documents` → `src/app/api/vendors/[vendorId]/documents/route.ts` |
| Vendor document delete | `DELETE /api/vendors/[vendorId]/documents/[docId]` |
| Work order list + create | `GET/POST /api/projects/[id]/work-orders` |
| Work order update + delete | `PATCH/DELETE /api/projects/[id]/work-orders/[woId]` |
| Bill create (with optional PDF upload) | `POST /api/projects/[id]/work-orders/[woId]/bills` |
| Bill update (status, link transaction) + delete | `PATCH/DELETE /api/projects/[id]/work-orders/[woId]/bills/[billId]` |
| Interactive CRUD panel (create WO, add bills, link txns, assign vendor) | `src/components/projects/work-order-panel.tsx` — used by job detail and maintenance detail |
| Global "New work order" modal (3-step: project → context → details) | `src/components/work-orders/new-work-order-modal.tsx` — inline creation for project (step 1) and job (step 2 CLIENT) |
| Global "Intake subcontractor bill" modal (3-step: project → WO → bill) | `src/components/work-orders/intake-bill-modal.tsx` — inline creation for project (step 1) and work order with nested vendor (step 2) |
| Vendor list UI | `src/components/vendors/vendor-list.tsx` |
| Vendor detail UI (docs vault, payment history) | `src/components/vendors/vendor-detail.tsx` |
| UploadThing routers | `vendorDocument`, `billPdf` — both in `src/lib/uploadthing.ts` |
| Status + label constants | `src/types/index.ts` → `WORK_ORDER_STATUS_*`, `BILL_STATUS_*`, `VENDOR_DOCUMENT_TYPE_LABELS` |
| Vendor label (Subcontractor vs Vendor) | `src/lib/terminology.ts` → `getVendorLabel(workspaceType)` |
| Unlinked transactions (excludes bill-linked) | `GET /api/projects/[id]/unlinked-transactions` |

**Global shortcuts — where the modals surface:**
- Client Hub (`/studio`, `src/components/studio/studio-client.tsx`) — "New work order" (pre-filtered CLIENT) and "Intake bill" in the *Take Action* strip
- Projects page (`/projects`, `src/components/projects/project-list.tsx`) — "New work order" (pre-filtered PROPERTY) and "Intake bill" in the header

**Inline entity creation** — all picker dropdowns across the modals use a `+ New [entity]…` sentinel (`__new__`) that swaps the select for an inline mini-form. Supported in:
- `WorkOrderPanel` — vendor (WO form + expanded panel picker)
- `NewWorkOrderModal` — project (step 1, calls `POST /api/projects`; PROPERTY type requires address), job (step 2 CLIENT, calls `POST /api/projects/[id]/jobs`)
- `IntakeBillModal` — project (step 1), work order with nested vendor creation (step 2, calls `POST /api/projects/[id]/work-orders`)
- Maintenance request creation is intentionally absent — the API requires `unitId`, which is unavailable in modal context.

Newly created entities are appended to the component's local state list — no page reload needed.

**Bill vendor inheritance:** the bill creation form has no vendor picker. The bill always inherits `vendorId` from its parent work order. "Add bill" is blocked (replaced by a prompt) until the work order has a vendor assigned. When creating a bill via `IntakeBillModal`, the work order's vendor is shown read-only in the confirmation strip.

**Bill → Transaction linking** mirrors `InvoicePayment` UX: `WorkOrderPanel` calls `GET /api/projects/[id]/unlinked-transactions`, renders a picker, then `PATCH …/bills/[billId]` with `{ transactionId }`. `Bill.transactionId` is `@unique`.

**Auto-status transitions:**
- Creating a work order with a vendor → status `ASSIGNED` (else `OPEN`)
- Adding the first bill to a work order → status `BILLED`
- Marking all bills on a work order `PAID` → work order status `PAID`

### Invoice lifecycle

| Task | File |
|---|---|
| Create / edit invoice | `src/components/projects/invoice-editor.tsx` |
| Invoice detail view | `src/components/projects/invoice-detail-client.tsx` |
| Invoice list | `src/components/projects/invoice-list.tsx` |
| CRUD | `GET/POST /api/projects/[id]/invoices` → `route.ts` |
| Single invoice | `GET/PATCH/DELETE /api/projects/[id]/invoices/[invoiceId]` → `route.ts` |
| AI assist (SSE) | `POST /api/projects/[id]/invoices/ai-assist` → `route.ts` |
| AI finalize (JSON) | `POST /api/projects/[id]/invoices/ai-finalize` → `route.ts` |
| PDF generate | `GET /api/projects/[id]/invoices/[invoiceId]/pdf` → `src/lib/pdf/invoice-pdf.tsx` |
| Send by email | `POST /api/projects/[id]/invoices/[invoiceId]/send` + `src/components/projects/send-invoice-modal.tsx` |
| Record payment | `POST /api/projects/[id]/invoices/[invoiceId]/payments` |
| Remove/move payment | `DELETE/PATCH /api/projects/[id]/invoices/[invoiceId]/payments/[paymentId]` |
| Renegotiate (void + replace) | `POST /api/projects/[id]/invoices/[invoiceId]/renegotiate` |
| Status logic | `src/lib/invoice-status.ts` |
| Auto-match payments at import | `src/lib/invoice-matching.ts` → `matchInvoicePayments()` |
| Quick-create shortcuts | `src/components/projects/new-invoice-shortcuts.tsx` |
| Invoice number format | `{INITIALS}_{DDMMYYYY}_{SEQ}` — logic in create + renegotiate routes |
| Payment methods display | `src/components/projects/payment-summary.tsx` — renders bank/PayPal/Stripe/custom from `UserPreference.data.paymentMethods` |
| Notes default | `UserPreference.data.invoiceNotesDefault` — pre-fills "Notes / payment terms" in editor; onBlur saves back. Not stored on `Invoice`. Deep-link: `/settings#invoice-notes-default`. |
| Payment instructions | `UserPreference.data.invoicePaymentNote` — pre-fills editor + shown in detail view and PDF only when non-empty. onBlur saves back. Not stored on `Invoice`. Deep-link: `/settings#payment-instructions`. |
| Key type | `src/types/index.ts` → `Invoice`, `PdfInvoice` |

### Estimate → Quote pipeline

| Task | File |
|---|---|
| Estimate editor | `src/components/projects/estimate-editor.tsx` |
| Estimate list (+ job picker for quote gen) | `src/components/projects/estimate-list.tsx` |
| Estimate CRUD | `GET/POST /api/projects/[id]/estimates` |
| Finalize / revise / duplicate | `POST …/finalize`, `…/revise`, `…/duplicate` |
| Estimate AI assist (SSE) | `POST /api/projects/[id]/estimates/[estId]/ai-assist` (estId can be `'new'`) |
| Quote generator (side-by-side) | `src/components/projects/quote-generator.tsx` + `src/stores/quote-generator-store.ts` |
| Quote detail | `src/components/projects/quote-detail-client.tsx` |
| Quote CRUD | `GET/POST /api/projects/[id]/quotes` |
| Quote actions | `send`, `accept`, `revise`, `amend`, `create-invoice`, `fulfillment`, `pdf` — all under `…/quotes/[quoteId]/` |
| Quote PDF | `GET /api/projects/[id]/quotes/[quoteId]/pdf` → `src/lib/pdf/quote-pdf.tsx` |
| Send quote by email | `src/components/projects/send-quote-modal.tsx` |
| Margin rules (settings) | `src/components/settings/margin-rules-editor.tsx` → `GET/POST /api/margin-rules`, `DELETE /api/margin-rules/[id]` |
| Fulfillment bar | `src/components/projects/fulfillment-bar.tsx` → `GET …/fulfillment` (computed at query time) |

### Receipts / OCR

| Task | File |
|---|---|
| Upload UI | `src/components/receipts/receipt-upload.tsx` |
| Receipts page | `src/components/receipts/receipts-page-client.tsx` |
| Full pipeline (OCR → extract → compress → store) | `POST /api/receipts/upload` → `src/app/api/receipts/upload/route.ts` |
| Mistral OCR | `src/lib/ocr/mistral.ts` |
| Claude extraction | `src/lib/ocr/extract-receipt.ts` |
| Image compression | `src/lib/ocr/compress-image.ts` |
| CRUD | `GET /api/receipts`, `PATCH/DELETE /api/receipts/[id]` |
| Retry failed | `POST /api/receipts/[id]/retry` |
| Suggest transaction links | `POST /api/receipts/[id]/suggest-transactions` |
| Receipt ↔ transaction link | `src/lib/receipt-matching.ts` |
| Key type | `src/types/index.ts` → `Receipt`, `ExtractedReceiptData` |

### Multi-agent AI

| Task | File |
|---|---|
| Ask route (SSE entry) | `POST /api/agent/ask` → `src/app/api/agent/ask/route.ts` |
| Orchestrator | `src/lib/agent/orchestrator.ts` |
| Domain classifier (Gemini) | `src/lib/agent/domain-classifier.ts` |
| Finance agent | `src/lib/agent/finance-agent.ts` |
| Finance tools | `src/lib/agent/finance-tools.ts` → `FINANCE_TOOLS`, `dispatchTool()` |
| Property agent | `src/lib/agent/property-agent.ts` |
| Property tools (13 tools) | `src/lib/agent/property-tools.ts` |
| Reusable tool loop | `src/lib/agent/tool-loop.ts` → `runToolLoop()` |
| Conversation history format | `src/lib/agent/format-history.ts` → `formatHistory()` |
| Agent types | `src/lib/agent/types.ts` → `AgentDomain`, `ConversationTurn`, `SseEvent` |
| Chat UI | `src/components/dashboard/agent-qa.tsx` |
| Chat overlay (global pill) | `src/components/chat/chat-overlay.tsx` |
| Client state (session + turns) | `src/stores/chat-store.ts` → `addTurn()`, `openWithMessage()` |
| Studio agent | `src/lib/agent/studio-agent.ts` + `studio-tools.ts` |
| Dashboard analyze | `POST /api/agent/analyze` |

### LLM primitives

| Function | Location | Use |
|---|---|---|
| `openrouterChat()` | `src/lib/llm/openrouter.ts` | Simple text completion, default `mistralai/devstral-small` |
| `openrouterWithTools()` | `src/lib/llm/openrouter.ts` | Tool-calling loop, streams to avoid timeout, retries 2× (2s/4s backoff), 90s abort |
| `openrouterStream()` | `src/lib/llm/openrouter.ts` | Streaming without tools, calls `onToken(chunk)`, returns full text |

### SSE event pattern (all streaming routes)

All SSE routes emit the same 4 event types over `text/event-stream`:

| Event | Payload | Client action |
|---|---|---|
| `status` | `{ type, text }` | Show italic status text |
| `token` | `{ type, text }` | Set message to full text so far (not a delta) |
| `done` | `{ type, text, actions[] }` | Set final text, apply actions |
| `error` | `{ type, text }` | Show error |

Routes using this pattern: `agent/ask`, `agent/rules`, `invoices/ai-assist`, `estimates/[estId]/ai-assist`

### Bank sync

| Task | File |
|---|---|
| Plaid (US) | `src/lib/bank-providers/plaid.ts` |
| Finexer (UK) | — (integrated in sync-engine) |
| Enable Banking (EU) | `src/lib/bank-providers/enable-banking.ts` |
| Shared sync pipeline | `src/lib/bank-providers/sync-engine.ts` → `importNormalizedTransactions()` |
| Provider adapter type | `src/types/bank-providers.ts` → `BankProviderAdapter` |
| All providers index | `src/lib/bank-providers/index.ts` |
| OAuth init | `POST /api/connections/init` |
| Enable Banking OAuth callback | `GET /api/connections/enable-banking/callback` |
| Connections CRUD | `GET/POST /api/connections`, `GET/PATCH/DELETE /api/connections/[id]` |
| Manual sync | `POST /api/connections/[id]/sync` |
| Scheduled sync (every 6h) | `POST /api/sync/scheduled` |
| Webhooks | `POST /api/webhooks/plaid`, `/webhooks/enable-banking`, `/webhooks/clerk` |
| Credential encryption | `src/lib/bank-agent/crypto.ts` → AES-256-GCM |
| Browser agent fallback (Browserless) | `src/lib/bank-agent/worker.ts` |
| Browser agent routes (SSE) | `src/app/api/bank-agent/` (connect, sync, status, disconnect) |
| Connections UI | `src/components/connections/connect-bank-dialog.tsx` |

### Property management

| Task | File |
|---|---|
| Portfolio dashboard | `src/components/portfolio/portfolio-client.tsx` |
| Unit board | `src/components/projects/unit-board.tsx` |
| Unit detail (lease/ledger/maintenance/messages tabs) | `src/components/projects/unit-detail-client.tsx` |
| Lease form | `src/components/projects/lease-form.tsx` |
| Lease PDF | `src/lib/pdf/lease-contract-pdf.tsx` |
| Lease contract send/sign | `POST …/leases/[leaseId]/contract/send`, `GET /api/public/lease-pdf/[token]`, `POST /api/public/lease-sign` |
| Tenant detail | `src/components/projects/tenant-detail-client.tsx` |
| Tenant invite (portal) | `POST /api/projects/[id]/tenants/[tenantId]/invite` |
| Rent roll / payment tracking | `src/lib/agent/property-tools.ts` → `get_rent_roll`, `get_tenant_balance` |
| Rent generation | `POST /api/rent/generate` |
| Maintenance board (kanban, cards link to detail) | `src/components/projects/maintenance-board.tsx` |
| Maintenance request detail (+ WorkOrderPanel) | `src/app/projects/[slug]/maintenance/[requestId]/page.tsx` |
| Maintenance CRUD | `GET/POST /api/projects/[id]/maintenance`, `PATCH/DELETE …/[requestId]` |
| Messages | `src/components/projects/messages-inbox.tsx` + `message-thread.tsx` |
| Listings (rental ads) | `src/components/projects/listings-client.tsx` |
| Public listing page | `src/components/public/listing-page-client.tsx` |
| Rental application form | `src/components/public/application-form-client.tsx` |
| Application submission | `POST /api/public/applications` |
| Applicant pipeline | `src/components/projects/applicant-pipeline.tsx` |
| Applicant detail | `src/components/projects/applicant-detail.tsx` |
| Convert applicant → tenant | `POST /api/projects/[id]/applicants/[applicantId]/convert` |
| Document request (manager) | `POST /api/projects/[id]/applicants/[applicantId]/request-docs` |
| Document upload (applicant) | `GET/POST /api/public/docs` → `src/components/public/doc-upload-client.tsx` |
| Tenant portal | `src/app/portal/` pages + `src/components/portal/` |

### Dashboard / widgets

| Task | File |
|---|---|
| Dashboard layout | `src/components/dashboard/dashboard-client.tsx` |
| Dashboard header (currency picker) | `src/components/dashboard/dashboard-header.tsx` |
| KPI bar | `src/components/widgets/KpiBar.tsx` → `GET /api/widgets/kpi` |
| Cashflow chart | `src/components/widgets/CashflowWidget.tsx` → `GET /api/widgets/cashflow` |
| Net worth | `src/components/widgets/NetWorthWidget.tsx` → `GET /api/widgets/networth` |
| Expenses by category | `src/components/widgets/ExpensesByCategoryWidget.tsx` → `GET /api/widgets/categories` |
| Generic widget data | `GET/POST /api/widgets/data` |
| Widget data pipeline | `src/lib/widgets/data-fetcher.ts` → `data-transformer.ts` |
| Chart routing | `src/components/widgets/charts/ChartRouter.tsx` |
| Date range picker | `src/components/widgets/RelativeDateRangePicker.tsx` |
| Colors | `src/lib/widgets/colors.ts` |
| FX conversion | `src/lib/fx.ts` → `getRate()`, `convertAmounts()` |
| FX seed script | `scripts/seed-fx-rates.ts` |
| FX refresh | `POST /api/fx-rates/refresh` |
| Pivot table | `src/components/pivot/pivot-page-client.tsx` + `src/lib/pivot/engine.ts` |

### Client Hub (`/studio`)

| Task | File |
|---|---|
| Page (server, data fetch) | `src/app/studio/page.tsx` |
| Client component | `src/components/studio/studio-client.tsx` |
| Invoice modal | `src/components/studio/studio-invoice-modal.tsx` |
| Action modals | `src/components/studio/studio-action-modals.tsx` |
| Mark sent modal | `src/components/studio/mark-sent-modal.tsx` |

---

## Cross-cutting concerns

### Auth + middleware

| Concern | Location |
|---|---|
| Route protection | `src/middleware.ts` (Clerk) |
| Extract userId in routes | `auth()` from `@clerk/nextjs/server` |
| Portal auth (tenant) | `src/lib/portal-auth.ts` |

### API response shape

All routes use helpers from `src/lib/api-response.ts`:
- `ok(data)`, `created(data)`, `badRequest(msg)`, `unauthorized()`, `notFound()`, `serverError(msg)`
- Shape: `{ data, error, meta? }`

### DB access

| Concern | Location |
|---|---|
| Prisma client singleton | `src/lib/prisma.ts` |
| Import path | `import { PrismaClient } from '@/generated/prisma/client'` — NOT `@/generated/prisma` |
| Adapter | `PrismaNeon` (WebSocket) — supports `$transaction`; never use `PrismaNeonHttp` |
| Ad-hoc CLI queries | `node` + `@neondatabase/serverless` — see CLAUDE.md |

### User preferences

| Concern | Location |
|---|---|
| Type definition | `src/types/preferences.ts` → `UserPreferenceData`, `InvoiceDefaults` |
| Read pattern | `parsePreferences(raw)` — never inline cast |
| Write pattern | `POST /api/preferences` (shallow merge) |
| Known keys | `businessName`, `yourName`, `fromEmail`, `fromPhone`, `fromAddress`, `fromVatNumber`, `fromWebsite`, `paymentMethods`, `invoicePaymentNote`, `invoiceNotesDefault`, `invoiceDefaults`, `lastRulesAgentRun`, `dashboardCurrency` |

### Shared types

| Type | File |
|---|---|
| Core domain types (Invoice, Quote, etc.) | `src/types/index.ts` |
| Widget types | `src/types/widgets.ts` |
| Preferences | `src/types/preferences.ts` |
| Application form data | `src/types/application-data.ts` |
| Bank agent types | `src/types/bank-agent.ts` |
| Bank provider adapter | `src/types/bank-providers.ts` |

### Client state (Zustand stores)

| Store | File | Holds |
|---|---|---|
| CSV import flow | `src/stores/upload-store.ts` | Multi-step upload state |
| Chat / AI overlay | `src/stores/chat-store.ts` | `sessionId`, `turns`, `addTurn()`, `openWithMessage()` |
| Quote generator | `src/stores/quote-generator-store.ts` | Margins, grouping, scope edits, optional toggles |

### Email

| Concern | Location |
|---|---|
| Email utility | `src/lib/email.ts` |
| Provider | Resend (`RESEND_API_KEY`, `RESEND_FROM`) — silently skipped if absent |

### PDF generation

| Document | File |
|---|---|
| Invoice | `src/lib/pdf/invoice-pdf.tsx` → `generateInvoicePdf()` |
| Quote | `src/lib/pdf/quote-pdf.tsx` |
| Lease contract | `src/lib/pdf/lease-contract-pdf.tsx` |

### Uploadthing (file storage)

| Concern | Location |
|---|---|
| Route handler | `src/app/api/uploadthing/route.ts` |
| Server config | `src/lib/uploadthing.ts` → `applicantDocUploader`, `adHocDocUploader`, `receiptThumbnail`, `vendorDocument`, `billPdf` |
| Client helpers | `src/lib/uploadthing-client.ts` → `useUploadThing`, `uploadFiles` |
| Max file size | Must be power-of-2 string: `"16MB"` not `"10MB"` |

### Document tokens (HMAC)

| Concern | Location |
|---|---|
| Generate / verify | `src/lib/doc-token.ts` → `generateDocToken()`, `verifyDocToken()` |
| Doc types registry | `src/lib/doc-types.ts` → `DOC_TYPES`, `docTypeLabel()` |
| Tokens are single-use | Nulled after upload; second attempt returns 400 |

### Utility / misc

| Utility | File |
|---|---|
| API response helpers | `src/lib/api-response.ts` |
| Slug generation | `src/lib/slug.ts` |
| Listing slug | `src/lib/listing-slug.ts` |
| Terminology (CLIENT vs PROPERTY labels) | `src/lib/terminology.ts` |
| Rate limiting | `src/lib/rate-limit.ts` |
| General utils (cn, etc.) | `src/lib/utils.ts` |

---

## Key data flow chains

### "Add a field to invoice PDFs"
`src/types/index.ts` (PdfInvoice type) → `src/app/api/projects/[id]/invoices/[invoiceId]/pdf/route.ts` (builds PdfInvoice from DB) → `src/lib/pdf/invoice-pdf.tsx` (renders)
Sender details come from `UserPreference.data` via `parsePreferences()`

### "Change how transactions are categorised at import"
`src/app/api/transactions/import/route.ts` → `src/lib/rules/categorize-batch.ts` → `src/lib/rules/user-rules.ts` (loads rules) → `src/lib/rules/engine.ts` (evaluates) → `src/lib/rules/evaluate-condition.ts` (condition check)

### "Change quote generation logic"
`POST /api/projects/[id]/quotes` → `src/app/api/projects/[id]/quotes/route.ts` → reads `Estimate` + `EstimateItem` + `MarginRule` from DB → creates `Quote` + `QuoteSection` + `QuoteLineItem`
UI: `src/components/projects/quote-generator.tsx` + `src/stores/quote-generator-store.ts`

### "Change the AI rules suggestions"
`GET /api/agent/rules` → `src/app/api/agent/rules/route.ts` → `src/lib/agent/rules-tools.ts` (tools + validator) → `src/lib/llm/openrouter.ts` (openrouterWithTools)
Background path: `src/lib/agent/run-rules-agent.ts` (called after CSV import)
To test locally: `pnpm tsx scripts/run-rules-agent.ts <userId>` (pre-loads all data, prints plan + suggestions to stdout)
**Sync requirement:** the system prompt exists in three places — `route.ts`, `run-rules-agent.ts`, and `scripts/run-rules-agent.ts`. Update all three together. The script prompt is intentionally adapted for pre-load mode (no tool fetches); the logic is otherwise identical.

### "Change what the finance AI agent can query"
`src/lib/agent/finance-tools.ts` (add tool definition + dispatch case) → `src/lib/agent/finance-agent.ts` (max rounds config)

### "Add a new user preference key"
1. `src/types/preferences.ts` → add to `UserPreferenceData` interface
2. Write via `POST /api/preferences` or dedicated route using `{ ...parsePreferences(existing?.data), newKey: value } as never`
3. Read via `parsePreferences(prefs?.data).newKey`

### "Add a new dashboard KPI widget"
`src/app/api/widgets/` (new route) → `src/components/widgets/` (new component) → `src/components/dashboard/dashboard-client.tsx` (wire in) → add FX conversion via `convertAmounts()` from `src/lib/fx.ts`

---

## Stack

Next.js App Router (`output: "standalone"`), TypeScript, PostgreSQL (Neon) + Prisma 7 (`@prisma/adapter-neon` WebSocket), Clerk auth, Tailwind CSS 4, shadcn/ui (base-nova), Zustand, Recharts, date-fns, decimal.js.

Hosting: Fly.io `fra` region (matches Neon EU Central 1). VM suspends ~5 min idle, resumes ~300ms.

---

## Data Model

All user data isolated by Clerk `userId`. Key Prisma models:

| Model | Notes |
|---|---|
| `Account` | Bank accounts/cards; belongs to `InstitutionSchema` |
| `Transaction` | `amount` signed (negative=expense); dedup via SHA-256 `duplicateHash(accountId,date,amount,description)`; `rawData` keeps original CSV |
| `Category` / `CategoryGroup` | Hierarchical; groups carry `scheduleRef` (internal, drives category seeding per business type — never surfaced in UI), `taxType` |
| `Payee` | Unique per `(userId,name)`; has `defaultCategoryId` |
| `CategorizationRule` | `conditions` JSON `{all?,any?}`; `priority` 1–99 (lower=first); sets category/payee/project/notes/tags |
| `RuleSuggestion` | AI candidates; `PENDING\|ACCEPTED\|IGNORED`; `workspaceId`/`workspaceName` denormalised |
| `ImportBatch` | CSV import sessions; `skippedCount` for duplicates |
| `InstitutionSchema` | Global CSV mapping templates; `csvMapping` JSON |
| `Project` | `WorkspaceType` (DB: `ProjectType`): `CLIENT\|PROPERTY\|OTHER` |
| `Job` | Sub-unit of CLIENT project; `status` enum `ACTIVE\|COMPLETED\|CANCELLED` (no `isActive`); `billingType`/`defaultRate` override `ClientProfile` |
| `ClientProfile` | Contact linked to project; `email`, `contactName` |
| `Estimate` | Internal costing; `workspaceId` scoped; `status` `DRAFT\|FINAL\|SUPERSEDED`; `parentId` for version chain |
| `EstimateSection` / `EstimateItem` | `hours`=effort/unit, `costRate`=cost/hr (never shown to client), `quantity`, `unit` label, `tags` for margin matching |
| `Quote` | Client-facing; `status` `DRAFT\|SENT\|ACCEPTED\|REJECTED\|SUPERSEDED\|AMENDED`; `overrides` JSON preserves human decisions; `quoteNumber` = `QTE-XXXX` |
| `QuoteSection` / `QuoteLineItem` | `sourceItemIds` tracks collapsed estimate items; `costBasis`/`marginPercent` internal-only |
| `MarginRule` | Default margin per tag; `@@unique([userId,tag])` |
| `Invoice` | `status` `DRAFT\|SENT\|PARTIAL\|OVERDUE\|PAID\|VOID`; `replacesInvoiceId` for renegotiation chain; `quoteId` optional |
| `InvoiceLineItem` | `isTaxLine: true` marks tax lines |
| `InvoicePayment` | `transactionId` `@unique`; auto-updates invoice status to `PARTIAL`/`PAID` |
| `InvoicePaymentSuggestion` | `HIGH\|MEDIUM` confidence; HIGH auto-applied at import |
| `UserPreference` | One row/user; `data` JSON — read via `parsePreferences()` from `src/types/preferences.ts` |
| `FxRate` | Monthly EUR-base rates; `(month,base,quote)` unique; carry-forward if missing |
| `BankPlaybook` / `EncryptedCredential` / `SyncJob` | Browser-agent bank sync state |
| `Listing` | `requiredDocs Json @default("[]")` — doc-type keys applicants must upload |
| `ApplicantDocument` | `status` `requested\|uploaded`; `uploadToken` HMAC-signed, single-use, 7-day TTL |
| `Receipt` | `status` `PROCESSING\|COMPLETED\|FAILED`; `ocrMarkdown` + `extractedData` JSON; `originalHash` SHA-256 (original discarded) |
| `Vendor` | User-scoped (not workspace-scoped); shared across all workspaces; `taxId` for 1099 tracking |
| `VendorDocument` | W9, INSURANCE_CERT, CONTRACT, OTHER; `expiresAt` for insurance cert expiry badge |
| `WorkOrder` | Polymorphic: either `jobId` (CLIENT path) or `maintenanceRequestId` (PROPERTY path); `workspaceId` denormalised for easy queries; `vendorId` nullable until assigned |
| `Bill` | Child of WorkOrder; `vendorId` required (denormalised from work order for direct vendor payment queries); `transactionId` `@unique` — same constraint pattern as `InvoicePayment` |

---

## Key Design Constraints

- `costRate` and `internalNotes` on `EstimateItem` are **never** included in quote or invoice output
- Estimate `jobId` is optional/legacy — job binding happens at Quote creation time, not estimate time
- `POST /api/projects/[id]/quotes` requires both `estimateId` and `jobId`
- Fulfillment (`GET …/fulfillment`) is computed at query time — nothing extra stored
- Invoice number format: `{INITIALS}_{DDMMYYYY}_{SEQ}` — initials from `businessName` or `yourName`, fallback `INV`
- `UserPreference.data` reads always go through `parsePreferences(raw)` — no inline `as Record<string,unknown>` casts
- Quote collapse: collapsing sums non-optional items; optional `sourceItemIds` stashed in collapsed item's `unit` field as `JSON.stringify({ optionalIds: [...] })`
- Workspace filter in `GET /api/transactions` reads from `projectId` param — do not rename to `workspaceId` on the client
- Background work (rules agent, invoice matching) runs fire-and-forget after CSV import; use `Promise.allSettled` for critical paths
- Never log bank credentials — username/password must never appear in `console.log`
- `WorkOrder` is polymorphic — set either `jobId` OR `maintenanceRequestId`, never both; the work order panel passes the correct context field based on `context.type`
- `Bill.vendorId` is denormalised (vendor is also reachable via `bill.workOrder.vendor`) — this duplication is intentional to support direct vendor-level payment history queries without joining through WorkOrder
- Job detail margin (`totalInvoiced − totalCosts`) is server-computed at page render; it does not update client-side when the `WorkOrderPanel` creates new work orders. A page reload is required to see updated margin/costs in the summary strip.

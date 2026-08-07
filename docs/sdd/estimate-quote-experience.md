# SDD: Quote unification — full merge (Option B) + reuse layer

## Context

- **Request:** Redesign estimates/quotes around how freelancers actually work: one
  client-facing document whose "quote-ness" is a status transition (draft → sent →
  accepted), templates + rate-item library as reusable assets, duplicate-and-adjust as
  the dominant path, change orders after acceptance, invoice derived from the accepted
  quote. Rationale: `docs/prd/estimate-quote-experience.md`.
- **Decision (product owner, 2026-08-07): Option B — full entity merge.** The separate
  `Estimate` entity is eliminated. Internal costing (costRate, tags, margins, risk,
  internal notes) becomes **per-line internal fields on `QuoteLineItem`** and a cost
  view inside a single quote editor. This supersedes the earlier Option-C draft of this
  SDD.
- **Scope:** Architectural — destructive schema change (3 models dropped, 1 relation
  removed), data migration script, ~15 routes deleted/rewritten, ~20 components/pages
  deleted/reworked, omni agent tool changes. One maintenance window required at deploy
  (see Phase G).
- **Other locked decisions:** no seeded/starter templates (empty state points to
  "save as template"); ballpark artifact deferred; terminology relabel pref deferred to
  a later PRD; no `/estimates` successor page — cost intelligence lives in the quote
  editor's internal columns.

## Current State (verified 2026-08-07)

**Live data (prod Neon):** 10 estimates (2 orphan — no quotes, both non-DRAFT), 14
quotes, 2 estimates shared by >1 quote, 49 estimate items, 30 quote line items, 0
collapsed `unit`-JSON stash rows, 0 amendments. Migration blast radius is minimal but
the script must be correct and self-verifying.

**Schema (to change):** `Estimate`/`EstimateSection`/`EstimateItem`/`EstimateStatus`
(`prisma/schema.prisma:922-982`); `Quote`/`QuoteSection`/`QuoteLineItem` (L986-1069);
`MarginRule` (L1073-1083). `InvoiceLineItem.qtyUnit` (L457) is the unit column on
invoices. `Workspace.estimates` and `Job.estimates` relations exist and must be removed.

**All Estimate touchpoints (exhaustive, from grep):**

| Area | Files | Nature |
|---|---|---|
| Estimate API | `src/app/api/projects/[id]/estimates/route.ts`, `[estId]/route.ts`, `[estId]/{finalize,revise,duplicate}/route.ts` | delete |
| Quote API | `quotes/route.ts` (POST reads estimate, shell creation L71-82, pricing L100-147, quoteNumber L92-95), `[quoteId]/route.ts` (PATCH full-replace L85-123), `[quoteId]/{regenerate,revise,amend,create-invoice,fulfillment,send,accept,cancel,pdf}/route.ts` | rewrite/keep per Phase D |
| Estimate pages | `src/app/projects/[slug]/estimates/{page.tsx,new/page.tsx,[estId]/page.tsx}` + 3 sidecars | delete |
| Quote pages | `quotes/{page.tsx,new/page.tsx,[quoteId]/page.tsx,[quoteId]/generate/page.tsx}` + sidecars | rework; generate → edit |
| Pipeline | `src/app/api/projects/[id]/pipeline/route.ts` (estimate nodes L34-186), `src/components/projects/pipeline-breadcrumb.tsx` (type union L7), `src/app/projects/[slug]/invoices/[invoiceId]/page.tsx` (+sidecar) | remove estimate nodes |
| Job surfaces | `src/app/api/projects/[id]/jobs/[jobId]/timeline/route.ts` (estimate events L32-65), `src/app/projects/[slug]/jobs/[jobId]/page.tsx`, `src/components/projects/job-list.tsx`, `src/components/projects/retro-view.tsx` | remove estimate sections/events |
| Editors | `estimate-editor.tsx` (761 lines), `quote-generator.tsx` (1002 lines), `quote-from-estimate.tsx`, `estimate-list.tsx`, `src/stores/quote-generator-store.ts` | delete (replaced) |
| Nav/actions | `project-sub-nav.tsx:20` ("Estimates" tab), `client-quick-actions.tsx:107-108`, `studio-top-section.tsx`, `studio-client.tsx`, `client-card.tsx`, `studio-action-modals.tsx` (`NewEstimateModal` L289-326) | remove estimate entries |
| Agent | `omni-tools.ts` (`APPLY_ESTIMATE_EDITS_TOOL` L114, mount L210, dispatch L263-266; `APPLY_QUOTE_EDITS_TOOL`), `page-context.ts` (`SerializableEstimateItem/Section` L10-23, `EditorAction` union L38, `entityType` L50), `omni-agent.ts:22`, `types.ts:28`, `site-capabilities-types.ts` (editorContext union), `prompts/omni.ts` (targeted check) | merge into one quote tool |
| Authz | `src/lib/authz.ts:51-57` (`requireEstimate`) | delete |
| Dead code | `estimate-list.tsx`, `quote-from-estimate.tsx`, `send-quote-modal.tsx`, `quote-generator-store.ts` (all zero importers) | delete |
| Settings | `margin-rules-editor.tsx` (orphaned, never mounted), `payment-settings-form.tsx:49-60` (`Section`, not exported), `settings/page.tsx:30-61` composition | mount + extend |
| Broken flows | `new-invoice-shortcuts.tsx:34-51` (no `dueDate` body → 500 always), `mark-sent-quote-modal.tsx:28-47` (POSTs `/send` without `{markOnly:true}` → re-emails client) | fix |
| Non-issues (false-positive grep hits — no action) | `finance-tools.ts` / `property-tools.ts` ("tax estimate" strings), `openrouter.ts`, `prompts/omni.ts:50` ("no estimates" = no guessing) | — |

**Reuse-layer design carried over unchanged from the Option-C draft:** `ServiceItem`
library, `QuoteTemplate`, duplicate-everything, starting-point picker, settings
sections, F1/F2 bug fixes, create-invoice fidelity, change-order UI. Where those specs
referenced the estimate editor, they now target the unified quote editor.

## Design

### Target data model (`prisma/schema.prisma`)

```prisma
model Quote {
  id                String         @id @default(cuid())
  jobId             String
  job               Job            @relation(fields: [jobId], references: [id])
  clientProfileId   String
  clientProfile     ClientProfile  @relation(fields: [clientProfileId], references: [id])
  quoteNumber       String
  title             String
  status            QuoteStatus    @default(DRAFT)
  version           Int            @default(1)
  currency          String         @default("USD")
  validUntil        DateTime?
  paymentSchedule   Json?
  scopeNotes        String?
  terms             String?
  notes             String?
  totalCost         Decimal?       @db.Decimal(12, 2)
  totalQuoted       Decimal?       @db.Decimal(12, 2)
  previousVersionId String?        @unique
  previousVersion   Quote?         @relation("QuoteVersions", fields: [previousVersionId], references: [id])
  nextVersion       Quote?         @relation("QuoteVersions")
  parentQuoteId     String?
  parentQuote       Quote?         @relation("QuoteAmendments", fields: [parentQuoteId], references: [id])
  amendments        Quote[]        @relation("QuoteAmendments")
  isAmendment       Boolean        @default(false)
  rootQuoteId       String?        // NEW — root of amendment chain; set at amend time to parent.rootQuoteId ?? parent.id
  sections          QuoteSection[]
  invoices          Invoice[]
  overrides         Json?          // kept as-is (unused; dropping is needless churn)
  sentAt            DateTime?
  sentTo            String?
  signedAt          DateTime?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  @@index([jobId])
  @@index([clientProfileId])
  @@index([rootQuoteId])
}
// estimateId + estimate relation REMOVED. QuoteStatus enum unchanged.

model QuoteSection { /* unchanged: id, quoteId, name, sortOrder, items, createdAt */ }

model QuoteLineItem {
  id            String   @id @default(cuid())
  sectionId     String
  section       QuoteSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  description   String
  quantity      Decimal  @db.Decimal(10, 3)
  unit          String?
  unitPrice     Decimal  @db.Decimal(10, 2)
  // ── internal costing (never rendered to client) ──
  costRate      Decimal? @db.Decimal(10, 2)   // NEW — internal cost per unit
  tags          String[]                       // NEW — margin-rule matching
  internalNotes String?                        // NEW
  riskLevel     String?                        // NEW
  priceManual   Boolean  @default(false)       // NEW — true once user edits unitPrice directly
  marginPercent Decimal? @db.Decimal(5, 2)     // kept; now server-derived per-unit: ((unitPrice−costRate)/costRate)×100
  isOptional    Boolean  @default(false)
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  @@index([sectionId])
}
// REMOVED columns: costBasis (derivable: costRate×quantity), hasEstimateLink, sourceItemIds.
// The collapsed-row `unit`-JSON optionalIds stash disappears with the collapse feature.

model ServiceItem { id, userId, description, unit String?, defaultRate Decimal(10,2),
  defaultCostRate Decimal?(10,2), tags String[], usageCount Int @default(0), timestamps, @@index([userId]) }
model QuoteTemplate { id, userId, name, sections Json, usageCount Int @default(0), timestamps, @@index([userId]) }
```

Also remove `estimates` relations from `Workspace` and `Job`, and delete
`Estimate`/`EstimateSection`/`EstimateItem` models + `EstimateStatus` enum.

### Key design choices

1. **One editor, one save path.** A new `quote-editor.tsx` (with extracted
   `quote-line-items-table.tsx` + `use-quote-form.ts` hook to respect the 400-line cap)
   is the only editing surface, at `/quotes/[quoteId]/edit` (the `/generate` route is
   deleted; all links updated). Every item row carries both client fields
   (description/qty/unit/price/optional) and internal fields (costRate/tags/risk/
   internal notes). Internal columns sit behind a "Show costs" toggle persisted in
   `localStorage['quote-editor-show-costs']`.
2. **Margin engine moves to per-item auto-pricing.** When `costRate` or `tags` change
   and `priceManual` is false, `unitPrice` auto-fills as
   `round2(costRate × (1 + maxMatchingTagMargin/100))`. Editing `unitPrice` sets
   `priceManual: true` (never auto-repriced afterwards). `marginPercent` is
   server-derived on save. This kills the simple-average bug (old F6) by construction —
   there is no averaging.
3. **Templates/duplicate instantiate directly into quote sections** — no shell estimate
   detour. Template item `{rate, costRate, tags}` → line item:
   `unitPrice = rate ?? autoPrice(costRate, tags) ?? 0`, `priceManual = rate != null`.
4. **Amendment chains get `rootQuoteId`** for O(1) fulfillment (replaces the
   `estimateId`-based descendant query from the Option-C draft).
5. **Migration expands from the estimate where cost data exists, falls back to the
   quote's own line items where it doesn't** (preserves user-tweaked prices exactly —
   see M3 rules). All migrated items get `priceManual: true` (never auto-repriced).
6. **Job stays required** (`Quote.jobId` non-null), but `POST /quotes` auto-creates a
   "General" job when the workspace has none (kills the old dead-end where the form was
   disabled with zero jobs).

### Pricing lib — `src/lib/quote-pricing.ts` (new, pure)

```ts
import { money, mul, add, toDisplay } from '@/lib/money'

export function maxTagMargin(tags: string[], marginByTag: Map<string, number>): number
export function autoPrice(costRate: number, tags: string[], marginByTag: Map<string, number>): number
  // round2(costRate × (1 + maxTagMargin/100))
export function itemMarginPercent(costRate: number | null, unitPrice: number): number | null
  // costRate null/0 → null; else round2(((unitPrice − costRate) / costRate) × 100)
export function quoteTotals(items: { quantity: number; unitPrice: number; costRate: number | null; isOptional: boolean }[])
  : { totalCost: number; totalQuoted: number }   // excludes isOptional items
```

Unit tests `src/lib/quote-pricing.test.ts`: max-tag selection; autoPrice with/without
matching tag; margin null on zero cost; totals exclude optional; totals with null
costRate contribute 0 to cost but full price to quoted; rounding (2dp).

## Plan

### Phase A — Additive schema + push

A1. Edit `prisma/schema.prisma`: add the five new `QuoteLineItem` fields
(`costRate`, `tags`, `internalNotes`, `riskLevel`, `priceManual`), `Quote.rootQuoteId`,
`ServiceItem`, `QuoteTemplate`. Do **not** remove anything yet.
A2. `DIRECT_URL="<direct>" pnpm db:push && DIRECT_URL="<direct>" pnpm prisma generate`.

### Phase B — Migration script

B1. New `scripts/migrate-estimates-into-quotes.ts` (mirror env/bootstrapping of
`scripts/run-rules-agent.ts` — targeted lookup for how it loads env + prisma). Run:
`DATABASE_URL=<pooled> DIRECT_URL=<direct> pnpm tsx scripts/migrate-estimates-into-quotes.ts`.

B2. Algorithm — for every `Quote` (include `estimate.sections.items`,
`sections.items`, `amendments` chain):
- **Per quote section:** if the estimate has a matching section (by name; fallback:
  positional) **and** Σ cost of its items > 0 → *expand from estimate*: for each
  estimate item create a line item:
  - `quantity = Number(item.hours ?? item.quantity)` (folds legacy hours, matching the
    old editor's load behavior at `estimate-editor.tsx:198-213`), `unit`,
    `costRate = item.costRate`, `tags`, `isOptional`, `internalNotes`, `riskLevel`.
  - Margin source: the quote line item whose `sourceItemIds` contains this estimate
    item's id → its `marginPercent`; if none (excluded optionals) → margin 0 and
    `isOptional = true`. Defensive: if a quote item's `unit` starts with `{`, parse
    `optionalIds` and treat those estimate items as optional/margin-0 (0 rows in prod,
    but keep the guard).
  - `unitPrice = round2(costRate × (1 + margin/100))` (costRate null → copy margin
    source's behaviour: if costRate null but the estimate item contributed to a priced
    section, distribute nothing — set `unitPrice = 0` only when costRate is null; see
    fallback below for the all-zero case). `priceManual = true`.
- **Fallback (section's Σ cost = 0, or no estimate match):** copy the quote's own line
  items verbatim (`description`, `quantity`, `unit`, `unitPrice`,
  `marginPercent`, `isOptional`; `costRate: null`, `tags: []`, `priceManual: true`).
  This preserves user-tweaked prices that have no cost basis.
- Delete old `QuoteSection`s and create the new ones in one `$transaction` per quote;
  recompute and persist `totalCost`/`totalQuoted` via `quoteTotals` (optional-excluded).
- **Orphan estimates** (no quotes): convert each to a DRAFT quote on its workspace:
  `clientProfileId` = the workspace's `ClientProfile.id` (skip + log if the workspace
  has none — PROPERTY workspaces); `jobId` = first ACTIVE job, else create job
  "General"; `title` = estimate title; items mapped with margin rules applied
  (`autoPrice`, but `priceManual: true` to freeze); `quoteNumber` continues the
  `QTE-####` sequence (max existing suffix + 1, keep incrementing).
- **Amendment chains:** for every quote with `parentQuoteId`, set
  `rootQuoteId` = walk-up root (0 rows in prod; implement anyway).
- **Self-verification:** per quote compare old `totalQuoted` vs new; exit non-zero if
  any drift > 0.01. Print a per-quote summary table + orphan-conversion report.

B3. Run against prod Neon. Inspect output. Only then proceed.

### Phase C — Destructive schema + push

C1. Remove from schema: `Estimate`, `EstimateSection`, `EstimateItem`,
`EstimateStatus`, `Quote.estimateId` (+relation), `QuoteLineItem.{costBasis,
hasEstimateLink, sourceItemIds}`, `Workspace.estimates`, `Job.estimates`.
C2. `DIRECT_URL="<direct>" pnpm db:push --accept-data-loss && DIRECT_URL="<direct>" pnpm prisma generate`
(CLAUDE.md schema-drift gotcha — app must be redeployed immediately after; see Phase G).

### Phase D — API routes

**Delete:** `src/app/api/projects/[id]/estimates/**` (5 files),
`quotes/[quoteId]/regenerate/route.ts`. Remove `requireEstimate` from
`src/lib/authz.ts`.

**D1. `quotes/route.ts` (POST rewrite):**
```ts
const CreateQuoteSchema = z.object({
  jobId: z.string().min(1),
  title: z.string().optional(),
  templateId: z.string().min(1).optional(),
})
```
- Ownership: workspace CLIENT + job belongs to workspace (existing checks).
- Zero-job escape: if `jobId === 'auto'`… no — simpler: the client never sends this;
  instead, when the workspace has no jobs the **client** calls
  `POST /api/projects/[id]/jobs { name: 'General' }` first (JobSelect already supports
  inline creation). Do not add server magic.
- Blank: create quote with one section `{ name: 'Services', sortOrder: 0 }`, no items.
- Template: fetch `quoteTemplate.findFirst({ where: { id: templateId, userId } })` →
  400 if missing; instantiate sections/items:
  `costRate: item.costRate ?? null`, `unitPrice: item.rate ?? (item.costRate != null ? autoPrice(item.costRate, item.tags, marginByTag) : 0)`,
  `priceManual: item.rate != null`, `tags`, `quantity`, `unit`, `isOptional`,
  `sortOrder`; `title: title ?? template.name`; increment `usageCount`.
- Keep: `quoteNumber` count+1 pattern (pre-existing race — noted risk),
  `validUntil` = today + `prefData.quoteValidityDays ?? 30`, `terms` = `prefData.quoteTerms`,
  currency from `clientProfile.currency ?? 'USD'`. Compute totals via `quoteTotals`.
- GET handler unchanged.

**D2. `quotes/[quoteId]/route.ts` (PATCH rewrite):**
- `UpdateQuoteSchema` sections items become:
  `{ description: min(1), quantity: positive.default(1), unit: nullish, unitPrice: min(0),
     costRate: min(0).nullish(), tags: string[].default([]), isOptional: default(false),
     internalNotes: nullish, riskLevel: nullish, priceManual: bool.default(false), sortOrder: int.default(0) }`.
- Keep wholesale section replace (delete + recreate). On write, derive
  `marginPercent = itemMarginPercent(costRate, unitPrice)` server-side and recompute
  `totalCost`/`totalQuoted` via `quoteTotals` (never trust client totals).
- Keep ACCEPTED edit block; keep other scalar fields; DELETE unchanged.
- `quoteInclude`: remove the `estimate` include (check the current include block — L44-53
  region; targeted lookup) everywhere it's used.

**D3. `revise/route.ts`:** drop `estimateId` from the copy (L38); copy the new item
fields verbatim (they're on the quote's own items now). Otherwise unchanged (status →
SUPERSEDED, new version + number, full section copy).

**D4. `amend/route.ts`:** drop `estimateId`; set `rootQuoteId: quote.rootQuoteId ?? quote.id`;
extend item schema with the five new fields (copy-through); keep ACCEPTED-only
precondition and fresh QTE number; `hasEstimateLink`/`sourceItemIds` references removed.

**D5. `duplicate/route.ts` (new):** `POST`, no body. Guards: CLIENT workspace,
ownership, `!isAmendment`. Copy quote: `title + ' (copy)'`, DRAFT, version 1, fresh
quoteNumber, same job/client/currency/terms/notes, `validUntil` = today + pref days,
full section/item copy (all new fields). Return `created(quote)`.

**D6. `create-invoice/route.ts`:** migrate to `authedRoute` (fixes unguarded
`request.json()` 500 on empty body); add `qtyUnit: i.unit ?? null` to the item map
(L52-62 region). Everything else unchanged.

**D7. `fulfillment/route.ts` + `quotes/[quoteId]/page.tsx` fulfillment block (L44-96):**
amendments query becomes
`where: { rootQuoteId: quote.rootQuoteId ?? quote.id, isAmendment: true, status: 'ACCEPTED' }`
(drop the `parentQuoteId` direct-children query). Same totals math otherwise.

**D8. `pipeline/route.ts`:** remove the estimate node from all three chain builders
(quote chain L46-66, invoice chain L114-135, estimate entity branch L158-186);
`VALID_ENTITIES` = `['quote', 'invoice']`. `pipeline-breadcrumb.tsx`: drop `'estimate'`
from the type union (L7). `invoices/[invoiceId]/page.tsx` + sidecar: remove the
estimate breadcrumb node (targeted lookup for where nodes are built).

**D9. `jobs/[jobId]/timeline/route.ts`:** remove the estimates query + the
`estimate_created`/`estimate_finalized` events (L32-65); keep quote/invoice events.

**D10. Unchanged routes:** `send`, `accept`, `cancel`, `pdf` (verify none reference
`quote.estimate` — targeted grep before/after; `pdf/route.ts` and
`src/lib/pdf/quote-pdf.tsx` did not appear in the estimate grep and need no changes;
`invoice-pdf.tsx`'s "estimate" hit is a string — verify and leave).

### Phase E — UI

**Delete:** `estimate-editor.tsx`, `quote-generator.tsx`, `estimate-list.tsx`,
`quote-from-estimate.tsx`, `send-quote-modal.tsx`,
`src/stores/quote-generator-store.ts`, all three `/estimates` pages + sidecars,
`/quotes/[quoteId]/generate/page.tsx` + sidecar, `NewEstimateModal` from
`studio-action-modals.tsx`.

**E1. Unified quote editor (new files):**
- `src/components/projects/hooks/use-quote-form.ts` — `useReducer` state
  `{ title, currency, notes, terms, validUntil, sections: SectionInput[] }` where
  `ItemInput = { id, description, quantity: string, unit: string, unitPrice: string,
  costRate: string, tags: string, isOptional: boolean, internalNotes: string,
  riskLevel: string, priceManual: boolean }` (string inputs, same idiom as the old
  estimate editor). Actions: set_title/currency/notes/terms/valid_until, add/remove/
  rename section, add_item (accepts optional `Partial<ItemInput>` payload for library
  inserts), remove_item, update_item. Auto-pricing lives in the `update_item` case:
  when field is `costRate` or `tags` and the row's `priceManual` is false → recompute
  `unitPrice` via `autoPrice` using margin rules passed into the hook; when field is
  `unitPrice` → set `priceManual: true`.
- `src/components/projects/quote-line-items-table.tsx` — per-section grid:
  Description (+ internal notes sub-input) | Qty+Unit | Price | [Cost | Tags | Margin |
  Risk] behind the toggle | Opt checkbox | delete. Tags cell: comma input +
  `<datalist>` fed by margin rules. Margin cell: read-only derived display.
- `src/components/projects/quote-editor.tsx` — orchestrator: header (title, currency,
  job/client read-only chips, "Show costs" toggle persisted to localStorage), sections,
  terms panel (validUntil date, notes, terms — moved up from old generator), totals bar
  (Σ cost / blended margin / Σ quoted via `quoteTotals`, optional-excluded), Save
  (PATCH D2) + Save & send (PATCH → POST `/send` → push to detail). HITL:
  `usePendingAiChanges` + `usePageContext({ editorContext: 'quote', dispatch })` —
  follow the pattern documented in CLAUDE.md and the old quote-generator (snapshot
  `{ sections, notes, terms, validUntil }`).
- New page `src/app/projects/[slug]/quotes/[quoteId]/edit/page.tsx` (server): ownership
  + DRAFT-only guard (non-DRAFT → redirect to detail, mirroring old generate page L35);
  serialize Decimals via `toDisplay`; render the editor in `ProjectPageShell`. New
  `page.capabilities.ts` sidecar with `editorContext: 'quote'`.

**E2. Creation flow:**
- `quotes/new/page.tsx`: fetch ACTIVE jobs, `quoteTemplate.findMany({ where: { userId },
  select: { id, name } })`, recent 10 quotes (`select: { id, quoteNumber, title, status }`).
  Delete the estimates fetch.
- `new-quote-form.tsx` rework: `startMode: 'blank' | 'template' | 'duplicate'` radio
  cards (default blank; hide unavailable modes). Blank: Title + JobSelect → POST
  `{ jobId, title? }` → push `/quotes/[id]/edit`. Template: + template select → POST
  `{ jobId, title?, templateId }`. Duplicate: recent-quote select only (job inherited;
  helper copy "Job, client and line items are copied from the original") → POST
  `/quotes/[quoteId]/duplicate` → push `/edit`. Remove the estimate select. Submit no
  longer disabled on zero jobs — JobSelect inline-add covers it.
- `quote-list.tsx` empty state copy → "Create a quote from a template, a recent quote,
  or from scratch."

**E3. Reuse layer UI (adapted from Option-C draft):**
- `src/hooks/use-margin-rules.ts` (new): fetch `GET /api/margin-rules` once; return
  `{ tag, marginPct }[]` (drives datalist + auto-pricing in the editor hook).
- `src/components/projects/service-item-picker.tsx` (new): "＋ From library" trigger;
  lazy-fetch `GET /api/service-items`; **`PortalDropdown` + `useOutsideClick` with
  `ignoreSelector: '[data-portal-dropdown]'`** (repo rule — editor tables are scroll
  containers); footer link "Manage library →" → `/settings#service-library`; onSelect →
  parent dispatches `add_item` with
  `{ description, unitPrice: String(defaultRate), costRate: String(defaultCostRate ?? ''), tags: tags.join(', '), unit: unit ?? 'hrs', priceManual: true }`;
  fire-and-forget `POST /api/service-items/[id]/use`.
- Save-to-library: bookmark icon button per item row (visible when description
  non-empty) → `POST /api/service-items { description, unit, defaultRate: parseFloat(unitPrice) || 0, defaultCostRate: parseFloat(costRate) || null, tags }`;
  transient ✓ feedback.
- `src/components/projects/save-template-modal.tsx` (new): name input → POST
  `/api/quote-templates` with sections snapshot from the editor
  (`rate = parseFloat(unitPrice) || null`, `costRate`, parsed tags; skip blank
  descriptions). Entry points: quote editor header + quote detail utility button.
- Settings (`settings/page.tsx` + new components): export `Section` from
  `payment-settings-form.tsx`; new `service-items-editor.tsx` (table: Description /
  Unit / Rate / Cost rate / Tags / delete; add-row; no inline edit — matches
  margin-rules idiom); mount orphaned `MarginRulesEditor`; new
  `quote-defaults-form.tsx` (`#quote-defaults`: validity days + terms, Save →
  `POST /api/preferences { quoteValidityDays: days || null, quoteTerms: terms || null }`);
  server page fetches margin rules + service items + prefs; render order:
  PaymentSettingsForm → QuoteDefaultsForm → `<Section id="service-library">` +
  `<Section id="margin-rules">` → AiFeaturesForm.

**E4. List/detail updates:**
- `project-sub-nav.tsx`: remove the Estimates tab (L20).
- `client-quick-actions.tsx`: remove "New estimate" (L107-108).
- `studio-top-section.tsx` + `studio-client.tsx` + `client-card.tsx`: remove New
  estimate action/modal wiring; keep New quote.
- Estimates list page: deleted (no successor; the `/estimates` route 404s — acceptable,
  it was project-scoped and low-traffic).
- `quote-list.tsx` + new `quote-row-actions.tsx`: row Duplicate button
  (`e.preventDefault(); e.stopPropagation()`; hidden for amendments; success → push
  `/edit`). Verify `isAmendment` is selected in `quotes/page.tsx` mapping (targeted).
- `quote-detail-client.tsx`:
  - Replace inline create-invoice panel (L351-379) with new
    `src/components/projects/create-invoice-panel.tsx` (due date default +30d; notes;
    optional-items checklist; milestone checkbox → label+percent; submit builds
    `includeItemIds` as `[...allNonOptionalIds, ...checkedOptionalIds]` when any
    optional is checked; body `{ dueDate, notes?, includeItemIds?, milestoneLabel?, milestonePercent? }`).
  - ACCEPTED action block (L283-302): add "Add change order" Link →
    `/projects/${projectSlug}/quotes/${quote.id}/amend`.
  - DRAFT "Edit" link (L214-255): point to `/edit`; allow for amendments too (the new
    editor handles them fine — no estimate linkage left). Keep DELETE DRAFT-only.
  - Add utility buttons near Preview PDF (L303-320): "Duplicate" (hidden for
    amendments) and "Save as template".
  - Remove the pipeline estimate node usage (via D8 changes) and any `quote.estimate`
    references in props/types (`QuoteDetailData` L34-60 — drop estimate, add
    `isAmendment`/`rootQuoteId` if absent).
- `quotes/[quoteId]/page.tsx`: drop estimate include; fulfillment per D7; breadcrumb
  nodes without estimate.

**E5. Change-order editor:**
- New `src/app/projects/[slug]/quotes/[quoteId]/amend/page.tsx` (server: ownership,
  ACCEPTED-only guard, render editor in ProjectPageShell) + `page.capabilities.ts`
  sidecar.
- New `src/components/projects/amendment-editor.tsx`: reuse `use-quote-form` internals
  if cleanly importable, else standalone `useState` sections
  (`[{ name: 'Change order', items: [empty row] }]`), columns
  Description | Qty+Unit | Price | Opt | delete (no cost columns — change orders are
  priced directly); submit → POST amend `{ title: `Change order — ${quoteNumber}`,
  sections }` → push to the new amendment's detail page. DRAFT amendments then open in
  the unified editor via Edit.

**E6. Bug fixes (F1/F2):** `new-invoice-shortcuts.tsx`: due-date input (default +30d),
send `{ dueDate }`, disable until both set. `mark-sent-quote-modal.tsx`: add
`Content-Type: application/json` + `body: JSON.stringify({ markOnly: true })`.

### Phase F — Agent + capabilities + docs

F1. `src/lib/agent/omni-tools.ts`: delete `APPLY_ESTIMATE_EDITS_TOOL`, its mount
(L210) and dispatch (L263-266). Extend `APPLY_QUOTE_EDITS_TOOL` with `set_sections`
(full item fields: description/quantity/unit/unitPrice/costRate/tags/isOptional) —
move/adapt the old estimate `set_sections` schema from `page-context.ts:38` onto the
quote target. Update the tool description to mention cost fields ("costRate/tags are
internal, never client-visible").
F2. `src/lib/agent/page-context.ts`: remove `SerializableEstimateItem/Section` or
rename → quote equivalents; `EditorAction` quote target gains `set_sections`,
`set_title`, `set_currency`; `entityType` union drops `'estimate'`.
F3. `src/lib/agent/omni-agent.ts:22` + `src/lib/agent/types.ts:28`: drop `'estimate'`
from the target unions. `site-capabilities-types.ts`: drop `'estimate'` from
`editorContext` (targeted lookup on the union).
F4. `src/lib/agent/prompts/omni.ts`: targeted check for estimate-editor references;
update if the prompt describes the estimate editor.
F5. Sidecars: delete `estimates/*` (3), update `quotes/new`, `quotes/[quoteId]`,
`quotes/[quoteId]/edit` (new), `quotes/[quoteId]/amend` (new), `quotes/page`,
`projects/[slug]/page`, `invoices/[invoiceId]`, `settings` (new anchors
`#service-library`, `#quote-defaults`; `#margin-rules` now real). Run
`pnpm run build:capabilities` — `--check` must pass.
F6. `codebase_map.md`: rewrite the "Estimate → Quote pipeline" section as "Quote
pipeline" (single-document), update Data Model rows (Quote/QuoteLineItem new fields;
ServiceItem/QuoteTemplate; remove Estimate rows), remove deleted files, update the
"Change quote generation logic" chain, stores table (remove quote-generator-store),
SSE `action` target list (drop `estimate`, quote gains set_sections).

### Phase G — Validation + deploy sequence

1. `pnpm lint && pnpm test && pnpm build`
   (`DIRECT_URL="postgresql://x:x@localhost/x"` dummy allowed for build).
2. `pnpm run build:capabilities --check`.
3. New unit tests pass: `src/lib/quote-pricing.test.ts`.
4. **Deploy sequence (single maintenance window — old code breaks after step c):**
   a. Phase A additive `db:push` (already done pre-merge).
   b. Run migration script against prod; verify zero drift report.
   c. Phase C destructive `db:push --accept-data-loss` against prod.
   d. `fly deploy` immediately (per CLAUDE.md, don't rely on push-triggered deploy
      timing; verify with `gh run list` if pushing instead).
5. Manual QA (staging of flows): blank/template/duplicate creation → editor →
   auto-pricing with margin rules → priceManual freeze → save → send/mark-sent →
   accept → change order → second change order on accepted amendment → fulfillment
   totals → create invoice (qtyUnit carried, optional checklist, milestone) →
   from-accepted-quote shortcut → studio mark-sent nudge (no email) → settings CRUD
   (service items, margin rules, quote defaults) → omni "edit my quote" set_sections
   with HITL banner.

## Files Changed

**New:** `src/lib/quote-pricing.ts` + test; `scripts/migrate-estimates-into-quotes.ts`;
`src/app/api/service-items/{route.ts,[itemId]/route.ts,[itemId]/use/route.ts}`;
`src/app/api/quote-templates/{route.ts,[templateId]/route.ts}`;
`src/app/api/projects/[id]/quotes/[quoteId]/duplicate/route.ts`;
`src/app/projects/[slug]/quotes/[quoteId]/edit/{page.tsx,page.capabilities.ts}`;
`src/app/projects/[slug]/quotes/[quoteId]/amend/{page.tsx,page.capabilities.ts}`;
`src/components/projects/{quote-editor.tsx,quote-line-items-table.tsx,service-item-picker.tsx,save-template-modal.tsx,quote-row-actions.tsx,create-invoice-panel.tsx,amendment-editor.tsx}`;
`src/components/projects/hooks/use-quote-form.ts`; `src/hooks/use-margin-rules.ts`;
`src/components/settings/{service-items-editor.tsx,quote-defaults-form.tsx}` (+optional
`quoting-sections.tsx` wrapper).

**Rewritten/edited:** `prisma/schema.prisma`; `quotes/route.ts`;
`quotes/[quoteId]/{route.ts,revise/route.ts,amend/route.ts,create-invoice/route.ts,fulfillment/route.ts}`;
`pipeline/route.ts`; `jobs/[jobId]/timeline/route.ts`; `authz.ts`;
`quotes/{page.tsx,new/page.tsx}`; `quotes/[quoteId]/page.tsx`;
`new-quote-form.tsx`; `quote-list.tsx`; `quote-detail-client.tsx`;
`pipeline-breadcrumb.tsx`; `project-sub-nav.tsx`; `client-quick-actions.tsx`;
`studio-{top-section,client,action-modals}.tsx`; `client-card.tsx`;
`new-invoice-shortcuts.tsx`; `mark-sent-quote-modal.tsx`; `settings/page.tsx`;
`payment-settings-form.tsx` (export Section); `jobs/[jobId]/page.tsx`; `job-list.tsx`;
`retro-view.tsx`; `invoices/[invoiceId]/page.tsx`; agent files (F1-F4);
`codebase_map.md`; sidecars (F5).

**Deleted:** `src/app/api/projects/[id]/estimates/**`;
`quotes/[quoteId]/regenerate/route.ts`; `/estimates/**` pages+sidecars;
`/quotes/[quoteId]/generate/**`; `estimate-editor.tsx`; `quote-generator.tsx`;
`estimate-list.tsx`; `quote-from-estimate.tsx`; `send-quote-modal.tsx`;
`src/stores/quote-generator-store.ts`.

## Execution Readiness

- Executor only needs targeted lookups in referenced files: **yes** (enumerated
  touchpoints table + line refs; flagged lookups are explicit: quoteInclude block,
  breadcrumb node builders, `isAmendment` in list mapping, editorContext union,
  run-rules-agent env bootstrap pattern).
- Executor does not need open-ended codebase exploration: **yes**.
- Executor does not need product/requirements clarification: **yes** (Option B locked;
  sub-decisions resolved: no estimate successor page, job stays required with
  inline-add, migration expansion-vs-fallback rules specified, `priceManual` semantics
  specified).
- Executor does not need to make unresolved design decisions: **yes**.
- Chosen approach, files, symbols, commands, and validation steps are explicit: **yes**.

## Risks / Open Questions

- **R1 — Maintenance window:** between destructive `db:push` (Phase G-c) and `fly
  deploy` (G-d) the old build errors on estimate queries. Window is minutes; acceptable
  for current traffic. Do not push to main mid-sequence (push triggers deploy).
- **R2 — Migration fidelity:** fallback rules preserve client-facing totals; the
  script's self-verification (exit non-zero on drift > 0.01) is the gate. Orphan
  estimates become DRAFT quotes with margin-applied prices — semantically new but
  harmless (never sent).
- **R3 — Multiple quotes per estimate (2 in prod):** each quote gets its own item copy
  (snapshot isolation) — post-merge edits to one no longer affect the other. This is
  desired, but call it out in release notes.
- **R4 — `quoteNumber` count-based race** carried over unchanged (pre-existing).
- **R5 — Editor size:** `use-quote-form.ts` + `quote-line-items-table.tsx` +
  `quote-editor.tsx` must each stay < 400 lines; if the terms/totals panel pushes the
  orchestrator over, extract `quote-editor-terms-panel.tsx`.
- **R6 — Omni tool change is user-visible:** `apply_estimate_edits` disappears; chat
  users mid-conversation on an estimate page (being deleted anyway) would 404 — no
  compat shim needed given the pages are gone.
- **R7 — `Quote.overrides` column** remains unused (kept to avoid extra migration
  churn; drop candidate in a future cleanup).

# PRD — Frictionless Estimates & Quotes: reuse-first creation, one-document lifecycle

Status: Direction confirmed · Date: 2026-08-07 · Companion SDD: `docs/sdd/estimate-quote-experience.md`

---


## 0. Decision log (2026-08-07)

Product owner reviewed §10 open questions and decided:

- **Q1 — Option B (full merge), NOT the recommended Option C.** `Estimate` is eliminated
  as an entity; internal costing becomes per-line fields on `QuoteLineItem` and a cost
  view inside a single quote editor. Quote-ness is purely a status transition. The SDD
  specs the merge, data migration, and the full reuse layer in one plan.
- **Q2 — n/a** (Option B subsumes the phasing question; single plan).
- **Q3 — Ballpark deferred** (out of scope).
- **Q4 — moot under Option B:** `/estimates` has no successor page; power users keep
  cost/margin intelligence via internal columns in the quote editor.
- **Q5 — No seeded/starter templates** (cannot assume the user's trade); empty template
  state points to "save any existing quote as a template".
- **Q6 — Terminology**: global `quote` default, manual relabel setting — deferred to a
  later PRD (not in this SDD).

Sections 7-8 below describe the Option-C phasing for posterity; the SDD is authoritative.

## 1. Problem statement

Real freelancers almost never build an estimate from scratch. They keep a handful of
templates (one per service type) and a mental rate card, and their per-client workflow is:

> **duplicate → add/remove line items → adjust quantities → occasionally adjust a rate → send.**

The reusable assets are two layers: **(1) a document skeleton** (standard sections/line
items) and **(2) a rate card / item library** (saved services with default rates). The
document itself is *one* artifact whose "quote-ness" is a **state transition**
(draft → sent → accepted), not a separate document type — and the invoice is derived from
the accepted quote plus any **change orders**.

Our app today models the domain differently:

- **Two heavyweight documents** (internal `Estimate` with cost rates → client-facing
  `Quote` with margins) managed across **5 pages and ≈13 UI actions** to go from "new
  estimate" to "invoice created" (see §3 journey J1).
- **Zero reuse layer in live UI**: no templates, no rate card/item library, no tag picker.
  An estimate-duplicate API route exists but is only reachable from an **orphaned,
  never-imported component** (`estimate-list.tsx`). Quote duplication does not exist at all.
- **Dead and broken surface area** accumulated around the pipeline (§5): the "From
  accepted quote" invoice shortcut **500s every time**, the Studio "mark quote sent" modal
  **re-emails the client** instead of just flipping status, the quote-amendment
  (change-order) API has **no UI**, and several components/routes/stores are unreachable.
- The conceptual split we *do* have — internal cost vs client price — is a genuine
  differentiator (margin rules, fulfillment tracking, per-item cost intelligence), but it
  is exposed as **two documents the user must manage** instead of **one document with an
  internal costing layer**.

The result: our most complex pipeline is built around the workflow nobody uses
(from-scratch, two-document), and lacks the workflow everybody uses
(template/duplicate-and-adjust).

## 2. What the product reality demands (from user research, pasted brief)

| # | Observation from the field | Our status today |
|---|---|---|
| 1 | Templates per service type are the starting point | ❌ Absent — every estimate/quote starts blank |
| 2 | Rate card / item library with default rates pulled in and tweaked | ❌ Absent — `MarginRule` is pricing *policy*, not content; `ClientProfile.defaultRate`/`Job.billingType` never feed quote pricing |
| 3 | Duplicate-last-similar as the dominant path | ⚠️ Estimate duplicate API exists, **no live UI**; quote duplicate absent; invoices (contrast) have "start from past invoice" |
| 4 | Estimate vs quote is one document; terminology varies regionally (US "estimate", UK/AU "quote") | ❌ We force two document types with fixed "Quote" labeling |
| 5 | Quote-ness = state transition (draft → sent → accepted) | ✅ `QuoteStatus` already models this — good foundation |
| 6 | Ballpark/range stage before the formal document | ❌ Absent (zero hits for ballpark/range concepts) |
| 7 | Change orders between acceptance and final invoice | ⚠️ Full schema + API (`amend`, `isAmendment`, amendment chain, fulfillment includes amendments) — **no UI reaches it** |
| 8 | One-click estimate→invoice conversion | ⚠️ Exists but drops `unit`/sections, excludes optional items with no picker, milestone mode unreachable, one entry point 500s |

## 3. Current journeys (measured from code)

**J1 — Estimate-first (canonical), from /studio:** New estimate → select client → "Go" →
build sections/items → Save → Finalize → "Create Quote" → pick job → "Go" →
[review/margins/terms] → Save Draft → Send → Mark Accepted → Create Invoice → due date →
confirm. **≈13 actions, 5 page loads** (estimates/new → estimate detail → generate →
quote detail → invoice detail).

**J2 — Quote-first shell build:** New quote → select client → job select → Create Quote →
build scope inline → Generate Quote → review → Save Draft → Send → Mark Accepted → Create
Invoice → due date. **≈10 actions, 4 page loads.** Fewer steps, but the "estimate" is
created and finalized *implicitly* — users don't know it exists.

**J3 — Duplicate-and-adjust (the dominant real-world path):** **not available in any live
UI.** Closest: Finalized estimate → "Create Revision" (version chain, original SUPERSEDED
— semantically wrong for "start a new client doc from this one").

Full journey map, entry-point inventory, and friction list: exploration findings are
folded into §5 and the file references throughout this PRD.

## 4. Goals & non-goals

### Goals

- **G1 — Reuse-first creation.** Every new client document starts from one of: a
  **template**, a **duplicate** of a past quote/estimate, or the **rate-item library** —
  never a blank page. Blank remains possible but is the last option, not the only one.
- **G2 — One client-facing document.** The user's mental model is a single document with
  statuses (Draft → Sent → Accepted → Invoiced). Internal costing becomes a *layer/view of
  the quote editor*, not a separately managed artifact. (Phased — see §7 options.)
- **G3 — Rate-item library.** User-scoped saved services (description, unit, default
  client rate, optional cost rate, default tags) insertable into any estimate/quote with
  one click, and saveable *from* any line item.
- **G4 — Templates.** Named, user-scoped skeletons (sections + items, optionally linked
  to library items). Create-from-template and save-existing-as-template.
- **G5 — Duplicate everywhere.** One click from list rows and detail pages: duplicate
  estimate, duplicate quote (both land in edit, titled "… (copy)").
- **G6 — Change orders as first-class UI.** Wire the existing `amend` machinery: "Add
  change order" on an ACCEPTED quote, amendment list on quote detail, fulfillment already
  accounts for them.
- **G7 — Kill broken/dead surface.** Fix the two live bugs (§5 F1–F2), remove or wire
  dead components (§5 F3), add missing row actions.
- **G8 — Terminology adaptability.** A `quoteLabel: 'estimate' | 'quote'` preference
  re-labels the client-facing document across UI and PDF (US vs UK/AU convention).
- **G9 — Invoice conversion fidelity.** create-invoice preserves `unit`, offers optional-item
  inclusion, exposes milestone invoicing, and keeps section structure (or consciously flattens
  with user consent).

### Non-goals (this PRD)

- Client-facing acceptance portal / e-sign on quotes (status transitions remain manual
  "Mark Sent / Mark Accepted"). Natural Phase-4 candidate; the `signedAt` field and
  lease-signing token pattern (`/sign/[token]`) are reusable when we get there.
- Ballpark/range artifact (verbal-qualification stage). Deferred; see §10 open questions.
- Payment-schedule editor UI (`Quote.paymentSchedule` stays API-only).
- Property-workspace quoting (estimates/quotes are CLIENT-only today; unchanged).
- Quote PDF visual templates (covered by the invoice-templates PRD's future notes).

## 5. Friction inventory to eliminate (grounded in code)

| # | Friction / bug | Location |
|---|---|---|
| F1 | **"From accepted quote…" invoice shortcut 500s every time** — no `dueDate` sent; route requires it and `request.json()` throws on empty body | `src/components/projects/new-invoice-shortcuts.tsx:103-127`, `src/app/api/projects/[id]/quotes/[quoteId]/create-invoice/route.ts:10-12,39` |
| F2 | **Studio "mark quote sent" re-emails the client** (POSTs to `/send` without `markOnly`) or errors when client has no email | `src/components/studio/mark-sent-quote-modal.tsx:32` |
| F3 | Dead surface: `estimate-list.tsx` (duplicate + generate-quote buttons), `quote-from-estimate.tsx`, `send-quote-modal.tsx` (message textarea), `quote-generator-store.ts` (zustand store, imported nowhere), `Quote.overrides` column, `quoteTerms`/`quoteValidityDays` prefs (consumed, no settings UI) | respective files |
| F4 | Estimate list page has **zero row actions** (no duplicate/revise/delete) | `src/app/projects/[slug]/estimates/page.tsx` |
| F5 | Tags are free text; a typo silently zeroes the margin (no picker against `MarginRule.tag`) | `estimate-editor.tsx` |
| F6 | Section price = **unweighted simple average** of item margins — untagged items drag it down | quote creation + `regenerate/route.ts` pricing logic |
| F7 | Job is required for quotes but asked late and via 4 separate inline pickers (2 dead); new-estimate page can't link a job at all | `new-quote-form.tsx`, `estimate-editor.tsx:468-499` |
| F8 | create-invoice drops `unit`, flattens sections, excludes optional items with no UI to include them; milestone mode API-only | `create-invoice/route.ts` |
| F9 | "Cancel" sets status REJECTED; five lifecycle verbs across two documents (finalize/revise/regenerate/revise/amend) | `cancel/route.ts` |
| F10 | Three divergent `estimateCost` implementations | `estimate-list.tsx:48-60`, `estimates/page.tsx:19-31`, `quote-generator.tsx:159-166` |
| F11 | Quotes empty-state copy says "generate from a finalized estimate" — contradicts the shell flow | `quotes/page.tsx` |
| F12 | Fully manual acceptance loop; PDF download needs a localStorage nudge to remember mark-sent | `quote-detail-client.tsx:331-338` |

## 6. Design principles (derived from the brief)

- **P1 — Instances, not originals.** Templates and rate items are the owned assets;
  quotes are disposable instances generated from them. Creation UX = "pick a starting
  point", not "fill a blank form".
- **P2 — Status transitions, not document types.** One client-facing document. Estimate
  vs quote is a *label* (regional pref) and a *status*, never two files to keep in sync.
- **P3 — Costing is a lens, not a document.** Cost rates, tags, risk, margins live in the
  quote editor as an internal view ("Costs" toggle / left pane), exactly as the
  quote-generator already does side-by-side. The user never navigates to a separate
  "estimate" unless they want cost detail.
- **P4 — Progressive commitment.** Ballpark (later) → draft → sent → accepted →
  invoiced, with change orders between accepted and final invoice. Each stage is one
  obvious action on the same document.
- **P5 — Tweak, don't retype.** Every line item is one click from the library; every new
  document is one click from a template or the most recent similar document.

## 7. Options considered (central architectural decision)

The brief's "clean design" says: *templates and rate items as their own entities,
estimates/quotes as instances, quote-ness a state transition rather than a separate
document type.* Our `Quote` already is a state machine; the open question is what happens
to the internal **`Estimate`** entity.

### Option A — Reuse layer only (keep both documents as-is)

Add `ServiceItem` library, `QuoteTemplate`, duplicate UI, fix friction (§5). The
estimate→quote pipeline stays exactly as it is.

- ✅ Smallest scope; all additive; zero migration risk; ships fastest.
- ❌ Does not address the core mismatch: two documents, 5 pages, finalize gate, implicit
  shell estimates. G2 unmet.

### Option B — Full merge (single document, estimate demoted or removed)

Collapse to one `Quote` entity. Cost fields move onto `QuoteLineItem` (`costBasis`
already exists); `Estimate` becomes either a pure costing *snapshot* embedded in the
quote or is removed behind a migration. Rewrite quote generator, fulfillment, studio
KPIs (`fetchLightweightQuotes`), agent tools (`apply_estimate_edits`), capabilities
sidecars, PDF data builders.

- ✅ Closest to the brief's ideal; one page, one document, cleanest mental model.
- ❌ Largest risk: data migration of every existing estimate/quote, rewrite of the
  margin/regeneration engine, loss of estimate versioning (`parentId` chain) semantics,
  big blast radius across studio KPIs + omni tools.

### Option C — Phased: reuse-first now, unified UX next (recommended)

- **Phase 1 (P0):** Option A in full — reuse layer (library + templates + duplicate),
  friction kills, create-invoice fidelity, change-order UI. All additive.
- **Phase 2 (P1):** **Quote-first unified creation.** "New quote" opens a starting-point
  modal (Template / Duplicate recent / Blank) and lands directly in the existing
  side-by-side generator (which already *is* the merged editor — left = costs, right =
  client doc). The estimate becomes backstage plumbing: auto-created from the template or
  as a shell; `/estimates` pages reframed as read-only "Costing history" or folded into
  quote detail. No schema merge — the two tables stay, but the user manages **one
  document**.
- **Phase 3 (P2):** Ballpark artifact, client acceptance link, payment-schedule UI —
  each independently shippable.

Option C gets ~90% of the brief's ideal with ~30% of Option B's risk. The schema stays
stable; only the *navigation and framing* change in Phase 2. **This is the recommendation.**

## 8. Functional requirements (by phase)

### Phase 1 — Reuse layer + friction kills (P0)

**FR1.1 — `ServiceItem` (rate-item library).** New user-scoped model: `description`,
`unit`, `defaultRate` (client price), `defaultCostRate?`, `tags[]`, `usageCount`,
timestamps. CRUD API (`/api/service-items`), management UI in Settings (new "Services &
rates" section beside margin rules), and an **"Add from library"** picker in both the
estimate editor and the quote-generator build mode. Insert pulls description/unit/rate;
user tweaks freely. "Save line to library" action on any line item (upserts by
description). `usageCount` increments on insert so the picker can sort by frequency.

**FR1.2 — `QuoteTemplate`.** New user-scoped model: `name`, `sections` (JSON snapshot of
`{name, items: [{description, unit, quantity, rate?, costRate?, tags[], isOptional}]}`),
`usageCount`. Created via **"Save as template"** on any estimate/quote; applied via the
creation modal. Applying a template to a new quote instantiates sections/items as a
normal (editable) estimate+quote. Seed 2–3 starter templates for the freelance business
type (e.g. the videographer skeleton from the brief: Pre-production / Shoot days / Kit /
Edit hours / Revisions / Licensing / Travel / Music / Contingency).

**FR1.3 — Duplicate, everywhere.** Surface existing estimate duplicate API as row action
on the estimates list + button on estimate detail. Add `POST …/quotes/[quoteId]/duplicate`
(new DRAFT quote, new `quoteNumber`, copies sections/terms/validity, same job/client;
blocked only when job deleted). Row action on quotes list + button on quote detail.

**FR1.4 — Starting-point modal.** `NewQuoteModal` (Studio) and `/quotes/new` become:
**From template** (picker) · **Duplicate a recent quote** (last 10, searchable) ·
**Blank** (link a job, shell estimate as today). All paths land in the generator.

**FR1.5 — Fix F1/F2.** "From accepted quote" shortcut gains a due-date field (or routes
to quote detail's existing panel). `MarkSentQuoteModal` POSTs `{ markOnly: true }`.

**FR1.6 — Dead-surface cleanup.** Delete `estimate-list.tsx`, `quote-from-estimate.tsx`,
`quote-generator-store.ts`; wire `SendQuoteModal`'s message textarea into the send flow
*or* delete it; add a Settings UI for `quoteTerms` + `quoteValidityDays`; decide
`Quote.overrides` (use in regenerate or drop column later).

**FR1.7 — Row actions + cost consolidation.** Estimates list gains Duplicate / Create
revision / Delete (API exists). Consolidate the three `estimateCost` implementations into
one helper in `src/lib/` (uses `money()` module per CLAUDE.md).

**FR1.8 — Tag picker + weighted margin (F5/F6).** Estimate item tags input becomes a
multi-select sourced from the user's `MarginRule` tags (+ free-create). Section pricing
switches to **cost-weighted** average margin; untagged items keep margin 0 but no longer
dilute tagged ones.

**FR1.9 — create-invoice fidelity (F8).** Copy `unit` onto invoice line items; add an
optional-items inclusion checklist to the create-invoice panel; expose milestone
invoicing (`milestonePercent` + label) as an option in the same panel; keep section
grouping as invoice line-item order with section header rows *or* flatten with a
user-visible note. `Invoice.quoteId` linkage unchanged.

**FR1.10 — Change-order UI (G6).** ACCEPTED quote detail gains **"Add change order"** →
opens generator-like editor pre-filled from the quote → POSTs to existing `amend` route.
Amendments list (already rendered at `quote-detail-client.tsx:531-553`) gains create
entry. Each amendment is sendable/acceptable via existing routes. Fulfillment bar already
includes accepted amendments — no backend change needed.

### Phase 2 — Unified quote-first UX (P1)

**FR2.1 — Generator becomes the single creation/edit surface.** All creation entries
(Studio, project, list pages) land in `/quotes/[id]/generate`. The left pane (costs) is
collapsible for users who never cost — the document works with prices only (costRate
optional, margin column hidden when no costs).

**FR2.2 — Estimate reframed backstage.** `/estimates/new` redirects into the quote-first
flow. `/estimates` list becomes "Costings" (read-mostly, still reachable from quote
detail's PipelineBreadcrumb); estimate finalize gate stays internal (auto-finalize on
generate, as shell flow already does). Estimate editor remains for cost detail edits
pre-send.

**FR2.3 — Terminology preference (G8).** `UserPreference.data.quoteLabel: 'estimate' |
'quote'` (default `'quote'`). A single `getQuoteLabel()` helper (extending
`src/lib/terminology.ts` pattern) drives nav labels, buttons, empty states, page titles,
email subject, and the **PDF document title** ("ESTIMATE" vs "QUOTE"). Studio KPIs and
notices adopt the label.

**FR2.4 — Combined save-and-send.** Generator gains "Save & send…" primary action
(existing send modal with PDF). Status transitions unchanged.

### Phase 3 — Lifecycle depth (P2, independently shippable)

**FR3.1 — Ballpark (optional).** Lightweight `ballpark` artifact: either a `Quote` with
`status: DRAFT` + `kind: BALLPARK` (range low/high instead of line items, plain-text
email body, no PDF) — or a preference-free "quick estimate email" generator. Design
deferred pending §10 Q3.

**FR3.2 — Client acceptance link.** Public token URL (`/quote/[token]`) reusing the
lease-signing HMAC pattern: client views PDF, clicks Accept → `signedAt` set, status
ACCEPTED, owner notified. Keeps manual "Mark Accepted" as fallback.

**FR3.3 — Payment-schedule editor** for `Quote.paymentSchedule` (deposit + milestones),
surfaced on quote detail, PDF, and create-invoice milestone mode.

## 9. Data model changes (Phase 1 only — both additive)

```prisma
model ServiceItem {
  id              String   @id @default(cuid())
  userId          String
  description     String
  unit            String?
  defaultRate     Decimal  @db.Decimal(10, 2)
  defaultCostRate Decimal? @db.Decimal(10, 2)
  tags            String[]
  usageCount      Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([userId])
}

model QuoteTemplate {
  id         String   @id @default(cuid())
  userId     String
  name       String
  sections   Json               // [{ name, items: [{ description, unit, quantity, rate?, costRate?, tags, isOptional }] }]
  usageCount Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([userId])
}
```

- Phase 2 adds **no** schema change (pref key only). Phase 3 ballpark *may* add
  `Quote.kind` enum — decided at that SDD.
- New models require `DIRECT_URL … pnpm db:push` before deploy (CLAUDE.md schema-drift
  gotcha). Money fields stay `Decimal`; all arithmetic via `src/lib/money.ts`.

## 10. Open questions (need answers before SDD)

- **Q1 — Direction:** Confirm Option C (phased) vs committing to Option B (full merge).
  *Recommendation: C.*
- **Q2 — Phase scope for the SDD:** Spec Phase 1 only, or Phase 1 + Phase 2 in one SDD?
  *Recommendation: Phase 1 as the first SDD; Phase 2 gets its own after Phase 1 ships.*
- **Q3 — Ballpark:** In-scope at all for this effort, or stay deferred? If in, prefer
  the `Quote.kind = BALLPARK` variant (reuses status machine) over a separate artifact?
- **Q4 — `/estimates` pages long-term (Phase 2):** hide behind quote detail entirely, or
  keep as a "Costings" list for power users? *Recommendation: keep as Costings — margin
  intelligence is our differentiator; some users will want it.*
- **Q5 — Starter templates:** seed videographer-style skeletons for all freelance users,
  or only when `businessType === 'freelance'` and only on first quote creation (vs
  settings opt-in)? *Recommendation: freelance onboarding + empty-state opt-in.*
- **Q6 — Terminology default:** default `quoteLabel` to `'quote'` globally, or infer
  `'estimate'` for US-locale signups? *Recommendation: global `'quote'` default; manual
  setting only (locale inference is a trap).*

## 11. Success metrics

- **Clicks-to-send** for the canonical path: J1 today ≈13 actions / 5 pages → target
  **≤5 actions / 2 pages** (pick template → tweak → Save & send).
- **Reuse adoption:** ≥60% of new quotes created from template/duplicate/library within
  60 days of Phase 1 (measurable via `usageCount` + a `createdVia` marker if added).
- **Time-to-first-quote** for new freelance users (onboarding → first SENT quote).
- **Bug burn-down:** F1/F2 eliminated (currently 100% failure / wrong-behaviour paths).
- **Change-order usage** (Phase 1 FR1.10): amendments created per accepted-quote baseline.

## 12. Risks

- **R1 — Terminology churn in UI copy:** "estimate" currently means *internal costing* in
  our UI; the brief uses it for the *client document*. Phase 2 must rename the internal
  concept to "Costing" in copy **before** introducing the `estimate` label pref, or users
  get whiplash. (Studio notices, pipeline breadcrumb, agent capabilities sidecars all say
  "estimate" today.)
- **R2 — Template staleness:** templates snapshot rates at save time; library edits don't
  retro-update templates. Acceptable (matches HoneyBook/Bonsai behaviour) but must be
  documented in template UI copy.
- **R3 — Implicit shell estimates (J2) already confuse**; Phase 1's starting-point modal
  increases shell-flow usage. Phase 2's reframing resolves, but between phases the
  estimates list may accumulate auto-created shells — mitigate by labeling shell-derived
  estimates in the list (or hiding `status = FINAL && auto-created` rows).
- **R4 — Weighted-margin change (FR1.8) alters pricing output** for existing margin-rule
  users. Ship with a one-line changelog note; do not re-price existing DRAFT quotes
  retroactively (applies to newly generated/regenerated only).

## 13. Agent / capabilities touchpoints (for the SDD)

- Omni tools: `apply_estimate_edits` / `apply_quote_edits` (`src/lib/agent/omni-tools.ts`)
  gain library/template awareness (e.g. `add_library_item` action) — Phase 2.
- Page capabilities sidecars: new/updated for `/quotes/new`, generator, settings
  sections; run `pnpm run build:capabilities` (mandatory per CLAUDE.md).
- Editor HITL pattern (`usePendingAiChanges`) applies to any AI insertion of library
  items / template application.
- Component-size cap: 400 lines/file — `quote-generator.tsx` is already ~1000 lines;
  Phase-1 additions must land in new sibling components/hooks, not inside it.

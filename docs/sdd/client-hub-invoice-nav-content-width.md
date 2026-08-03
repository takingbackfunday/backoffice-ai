# SDD — Client Hub invoice creation via page navigation & client-page content width

**Slug:** `client-hub-invoice-nav-content-width`
**PRD:** `docs/prd/client-hub-invoice-nav-content-width.md`
**Status:** Draft (pending approval)
**Date:** 2026-08-03

---

## 1. Architecture overview

Two independent change sets, both pure client/frontend — no schema, API, or env work.

**A. Invoice creation flow (Client Hub).** Today both "Draft invoice" triggers on `/studio` render `StudioInvoiceModal` (`src/components/studio/studio-invoice-modal.tsx`), a slide-over embedding a client picker + inline client creation + `NewInvoiceShortcuts` + `InvoiceEditor`. This duplicates the canonical page `src/app/projects/[slug]/invoices/new/page.tsx`, which already renders the same shortcuts + editor with full server-fetched context (client profile, prefs, jobs, accepted quotes). The change replaces the modal with plain Next.js navigation:

- Per-client card action → `router.push('/projects/{slug}/invoices/new')` (the `clients` prop on `StudioClient` already carries `slug` — built in `src/app/studio/page.tsx` lines 51–68).
- Take Action action → new `DraftInvoicePickerModal` (small shadcn `Dialog`) → select client → navigate; `__new__` sentinel → inline 3-field create form → `POST /api/projects` → navigate using the `slug` from the response.

Removing the modal orphans three `StudioClient` props (`paymentMethods`, `invoiceDefaults`, `hasTransactions` — consumed by nothing else in `studio-client.tsx`) and their server-side fetching in `src/app/studio/page.tsx` (`prisma.userPreference.findUnique`, `prisma.transaction.count`, and the `parsePreferences` import). These are deleted too.

**B. Content width (client-project pages).** Commit `c70be6e` added the opt-in `contentWidth` prop (`'md'` → `max-w-3xl`, `'lg'` → `max-w-4xl`; `src/components/layout/content-width.ts`) to `ProjectPageShell` (`src/components/layout/project-page-shell.tsx`) and `PageShell`. This change adopts the prop on the remaining CLIENT detail/form-style pages and migrates four ad-hoc inner `max-w-4xl` wrappers onto it. No shell or `content-width.ts` changes are needed. Data-dense pages (full-width `<table className="w-full">` or side-by-side layouts) stay fluid per the prior PRD's principle.

## 2. Data model changes

None. No Prisma edits, no `db:push`.

## 3. API design

No new routes. The picker reuses the existing client-creation endpoint:

- `POST /api/projects` — body `{ name: string, type: 'CLIENT', client: { contactName?: string, email?: string } }`; response `{ data: { id, slug, clientProfile, ... } }`. Same call the deleted modal made (`studio-invoice-modal.tsx` lines 62–73) and the same shape `NewClientModal` in `src/components/studio/studio-action-modals.tsx` relies on for its `onCreated({ slug })` callback.

## 4. File-by-file change plan

Implementation order: A1→A6 (flow), then B1→B7 (width). The two sets touch disjoint files and could also run in parallel.

### A. Invoice creation flow

**A1. NEW `src/components/studio/draft-invoice-picker-modal.tsx`** (~130 lines, well under the 400-line cap)
- `'use client'`; shadcn `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` (import pattern from `src/components/projects/from-transactions-modal.tsx` lines 5, 112–114).
- Props: `{ clients: { id: string; name: string; slug: string; company: string | null }[]; onClose: () => void }`.
- State: `selectedClientId`, `showNewClient`, `newClientName`, `newContactName`, `newClientEmail`, `creating`, `error`.
- Body: `<select>` (`Select a client…` placeholder option; options `name` + ` — company` when present; `__new__` sentinel last) rendered when `!showNewClient`; otherwise the inline mini-form (name required, contact/email optional, Create/Cancel buttons) — copy the input styling and `__new__` swap pattern from `studio-invoice-modal.tsx` lines 122–180 (the file is deleted in A4; lift the markup before deleting).
- `handleCreateClient`: `POST /api/projects` with `{ name, type: 'CLIENT', client: { contactName: … || undefined, email: … || undefined } }`; on `!res.ok || json.error` set `error`; on success `router.push(\`/projects/${json.data.slug}/invoices/new\`)` (no `onClose` needed — navigation unmounts).
- Footer: Cancel (`onClose`) + Continue (disabled until `selectedClientId`; `router.push(\`/projects/${slug}/invoices/new\`)` using the selected client's slug).
- `useRouter` from `next/navigation`.

**A2. EDIT `src/components/studio/studio-client.tsx`**
- Delete `import { StudioInvoiceModal }` (line 6) → add `import { DraftInvoicePickerModal } from '@/components/studio/draft-invoice-picker-modal'`.
- Delete `import type { PaymentMethods }` (line 12) — unused after modal removal.
- Props (lines 23–35): remove `paymentMethods`, `invoiceDefaults`, `hasTransactions` from the interface and destructuring (line 37).
- `showInvoiceModal` state (line 45) → rename to `showInvoicePicker` (the `preselectedClientId` state on line 53 stays — still used by `LogTimeModal`).
- Take Action `onDraftInvoice` (line 271) → `() => setShowInvoicePicker(true)`.
- Card `onDraftInvoice` (line 294) → direct navigation: `(clientId) => { const c = clients.find(x => x.id === clientId); if (c) router.push(\`/projects/${c.slug}/invoices/new\`) }` (`router` already in scope, line 38).
- Replace the `StudioInvoiceModal` render block (lines 300–309) with `{showInvoicePicker && <DraftInvoicePickerModal clients={clients} onClose={() => setShowInvoicePicker(false)} />}` (`clients` items have `id/name/slug/company` — satisfies the picker prop type directly).

**A3. EDIT `src/app/studio/page.tsx`**
- Remove `prisma.userPreference.findUnique` and `prisma.transaction.count` from the `Promise.all` (lines 31, 44), drop `prefsData`/`paymentMethods`/`invoiceDefaults` (lines 46–48), and the `parsePreferences` import (line 4) — all solely fed the deleted modal.
- Remove `paymentMethods`, `invoiceDefaults`, `hasTransactions` from the `<StudioClient>` JSX (lines 85, 88, 91).

**A4. DELETE `src/components/studio/studio-invoice-modal.tsx`** (after A1 lifts the picker markup).

**A5. EDIT `src/components/projects/new-invoice-shortcuts.tsx`**
- Remove `onSelectProject` from `Props` (line 22), destructuring (line 25), and the `FromTransactionsModal` render (line 169). The only caller that ever passed it was the deleted modal; the new-invoice page does not pass it. `FromTransactionsModal`'s own optional `onSelectProject` prop stays (self-contained; unchanged).

**A6. EDIT `codebase_map.md`** (keep-current requirement)
- Client Hub section (~line 423): replace the `Draft invoice creation modal | src/components/studio/studio-invoice-modal.tsx` row with `Draft invoice client picker | src/components/studio/draft-invoice-picker-modal.tsx — selects/creates a client, then navigates to /projects/[slug]/invoices/new`.
- In the same section's prose (~line 427), note: "Draft invoice" actions navigate to the client's new-invoice page; the Take Action entry first asks which client via `DraftInvoicePickerModal`.
- `/studio` row in the Pages table and `src/app/studio/page.capabilities.ts` need no changes (jobsToBeDone remains accurate).

### B. Content width — CLIENT project pages

All edits add `contentWidth="lg"` to `ProjectPageShell` and/or remove the now-redundant inner `max-w-4xl` wrapper. No shell/`content-width.ts` changes.

| # | File | Change |
|---|---|---|
| B1 | `src/app/projects/[slug]/page.tsx` | Add `contentWidth={project.type === 'CLIENT' ? 'lg' : undefined}` to `ProjectPageShell` (line 77–81). PROPERTY/OTHER branches stay fluid. |
| B2 | `src/app/projects/[slug]/jobs/[jobId]/page.tsx` | Add `contentWidth="lg"`; remove `max-w-4xl` from the inner wrapper `<div className="max-w-4xl">` (line 158) → plain `<div>`. |
| B3 | `src/app/projects/[slug]/estimates/page.tsx` | Add `contentWidth="lg"` (no inner wrapper exists). |
| B4 | `src/app/projects/[slug]/estimates/new/page.tsx` | Add `contentWidth="lg"`; inner `<div className="max-w-4xl">` (line 29) → plain `<div>`. |
| B5 | `src/app/projects/[slug]/estimates/[estId]/page.tsx` | Add `contentWidth="lg"`; inner `<div className="max-w-4xl space-y-4">` (line 102) → `<div className="space-y-4">`. |
| B6 | `src/app/projects/[slug]/quotes/page.tsx` | Add `contentWidth="lg"`; inner `<div className="max-w-4xl">` (line 56) → plain `<div>`. |
| B7 | `src/app/projects/[slug]/quotes/[quoteId]/page.tsx` | Add `contentWidth="lg"`; inner `<div className="max-w-4xl space-y-4">` (line 153) → `<div className="space-y-4">`. |

**Explicitly untouched (stay fluid):** `jobs/page.tsx`, `invoices/page.tsx`, `work-orders/page.tsx`, `time/page.tsx`, `financials/page.tsx`, `quotes/[quoteId]/generate/page.tsx` — full-width tables or side-by-side layouts.

## 5. Reuse map

| Existing module | Reused for |
|---|---|
| `src/components/layout/content-width.ts` + `contentWidth` prop on `ProjectPageShell` | All of change set B — no new width code |
| shadcn `Dialog` (`src/components/ui/dialog`) as used by `from-transactions-modal.tsx` | `DraftInvoicePickerModal` shell |
| `__new__` sentinel + inline mini-form pattern (CLAUDE.md "Inline entity creation"; markup lifted from `studio-invoice-modal.tsx` lines 122–180) | Picker's "+ New client…" flow |
| `POST /api/projects` (`src/app/api/projects/route.ts`) | Inline client creation — same payload as before |
| `/projects/[slug]/invoices/new` page (`NewInvoiceShortcuts` + `InvoiceEditor` + server-fetched prefs/quotes/jobs) | The landing surface — replaces everything the modal embedded |
| `clients` prop shape on `StudioClient` (has `id`, `name`, `slug`, `company`) | Direct per-card navigation + picker options |

## 6. Edge cases & error handling

- **Zero clients:** `StudioClient` early-returns the "No active clients" empty state (lines 204–214) before the Take Action strip renders, so the picker is unreachable. Defensive: with an empty `clients` array the picker select shows only the placeholder + `__new__` option — still functional.
- **Create-client failure:** `POST /api/projects` non-OK → inline `error` text in the picker; user stays in the dialog (mirrors the deleted modal's `clientError` handling). Button shows `…` while `creating`.
- **Slug lookup miss on card action:** `clients.find` returns undefined → no-op (guard clause). Cannot happen in practice (card id comes from the same `clients` array).
- **New client 404 risk:** `/projects/[slug]/invoices/new` calls `notFound()` when `clientProfile` is missing; `POST /api/projects` with `type: 'CLIENT'` creates the `ClientProfile` in the same request (existing behavior both the deleted modal and `NewClientModal` depend on), so the landing page always resolves.
- **Back-button trail:** after landing on the new-invoice page, Back returns to `/studio` — strictly better than the modal (which had no URL). Unsaved-invoice guards are unchanged (the editor's existing dirty-guard covers in-page Settings links only; closing/navigating away behavior is the same as today's page flow).
- **Modal-vs-page state drift:** previously the modal could switch clients mid-draft (`onSelectProject`); now the client is fixed by the URL — intended per the PRD.
- **Width regressions:** `max-w-4xl` only caps width; below 896px every migrated page renders identically to today. Migrations B2/B4–B7 keep the same effective width as the removed ad-hoc wrappers.
- **Lint constraints to respect:** hooks at component top level in the new picker; `studio-client.tsx` stays under the 400-line cap (net deletion); no dropdowns inside scroll containers are added (picker is a centered `Dialog`, not a portal dropdown).

## 7. Testing strategy

- No new pure logic → no new Vitest files. The change is navigation wiring + CSS-class adoption, neither testable under the current pure-logic-only setup (no jsdom/RTL).
- Existing suites must stay green: `pnpm test` (notably `src/components/layout/content-width.test.ts` — untouched).
- `pnpm lint` — catches unused imports/vars after the prop/state deletions (`PaymentMethods`, `InvoiceDefaults` type imports in `studio-client.tsx`, `parsePreferences` in `page.tsx`).
- `pnpm build` — type-checks the props contract changes between `page.tsx` → `StudioClient` and the deleted component. `build:capabilities` runs as part of build; no sidecar changes, so the manifest is unchanged.
- Manual verification checklist (mirrors PRD ACs): card action → invoice page; Take Action → picker → existing client; picker → `__new__` → created client's invoice page; zero-client empty state; ≥1600px viewport width checks on all seven B-pages + fluid pages unchanged; PROPERTY overview unchanged.

## 8. Rollout notes

- No env vars, no DB migration, no deploy caveats. Standard flow: commit without pushing; deploy only when the user asks (push to `main` → GitHub Actions → Fly.io), then verify via `gh run list --repo takingbackfunday/backoffice-ai --limit 3`.
- Safe to ship in one PR; sets A and B are independent and could land separately without conflict (disjoint files).
- Follow-up (documented, not this PR): the ad-hoc `maxWidth: 960` inline style on `/studio` (`studio-client.tsx` line 217) and `/portfolio` could later adopt a shell-level pattern; `FromTransactionsModal`'s now-always-undefined `onSelectProject` prop could be pruned in a future cleanup.

# PRD — Client Hub invoice creation via page navigation & client-page content width

**Slug:** `client-hub-invoice-nav-content-width`
**Status:** Draft (pending approval)
**Date:** 2026-08-03

---

## 1. Problem statement

**A. Invoice creation on Client Hub happens in a modal, not on the real pages.** Both "Draft invoice" entry points on Client Hub (`/studio`) — the Take Action strip and the per-client card quick action — open `StudioInvoiceModal`, a right slide-over that embeds a client picker, an inline new-client mini-form, the quick-create shortcuts, and the full `InvoiceEditor`. This duplicates the real new-invoice page (`/projects/[slug]/invoices/new`), which already renders the same `NewInvoiceShortcuts` + `InvoiceEditor` with full page context (breadcrumb, project header, sub-nav). Users drafting an invoice never land on the client's page, lose the surrounding navigation context, and the app maintains two parallel creation surfaces that can drift.

**B. Client-project pages sprawl on wide screens.** Commit `c70be6e` introduced the opt-in `contentWidth` prop on `ProjectPageShell`/`PageShell` (`'md'` → `max-w-3xl`, `'lg'` → `max-w-4xl`) and applied it to the invoice pages. The rest of the client-project pages (`/projects/[slug]` for CLIENT workspaces) were not adopted: the overview renders fully fluid, and several pages (job detail, estimate new/detail, quotes list, quote detail) still carry ad-hoc inner `max-w-4xl` wrapper divs instead of the shell prop.

## 2. Goals & non-goals

**Goals**
- G1: Every "Draft invoice" action on Client Hub leads the user to the real client-scoped new-invoice page (`/projects/[slug]/invoices/new`) — no embedded editor modal.
- G2: Per-client card "Draft invoice" navigates directly (client already known).
- G3: Take Action "Draft invoice" (no client context) opens a lightweight client-picker dialog, then navigates; the picker supports inline "+ New client" creation (per user decision) and lands on the new client's invoice page.
- G4: Delete `StudioInvoiceModal` and its now-dead wiring (props, state, data fetching) once unwired.
- G5: Adopt the `contentWidth` shell prop across the client-project pages: constrain form/detail-style pages at `lg` (`max-w-4xl`), migrate existing ad-hoc `max-w-4xl` wrappers to the prop, and leave data-dense table/side-by-side pages fluid.

**Non-goals**
- Not changing the quote-detail page's "Create invoice" panel or `NewInvoiceShortcuts` behavior (they already land on real invoice pages).
- Not changing `FromTransactionsModal`'s project-picker internals (its `onSelectProject` prop becomes unused but remains a valid optional API).
- Not constraining PROPERTY or OTHER workspace pages, the Client Hub page itself (`/studio` keeps its own `maxWidth: 960`), or data-dense pages (jobs/invoices/work-orders lists, time tracker, financials, quote generator).
- Not redesigning the picker beyond the established shadcn `Dialog` + `__new__` sentinel pattern.
- No data model, API, or schema changes.

## 3. User stories

1. As a freelancer on Client Hub, when I click "Draft invoice" on a client's expanded card, I want to land on that client's new-invoice page, so I have the full page context (breadcrumb, sub-nav) while I work.
2. As a freelancer on Client Hub, when I click "Draft invoice" in the Take Action strip, I want to quickly pick which client to invoice (or create a new one) and then continue on their invoice page, so I don't edit inside a cramped overlay.
3. As a freelancer who just onboarded a client mid-flow, I want "+ New client" inside the picker, so I can create the client and immediately draft their first invoice without detouring through another page.
4. As a user on a wide monitor, I want the client overview, job detail, estimate, and quote pages to render at the same comfortable fixed width as the invoice pages, so related elements stay near each other and the pages read as one coherent column.
5. As a developer, I want all width constraints to go through the `contentWidth` shell prop, so there is one pattern instead of ad-hoc wrapper divs.

## 4. Functional requirements

**Invoice creation flow**

- FR-1: The per-client card "Draft invoice" quick action (`client-card.tsx` via `client-cards-section.tsx`) navigates to `/projects/{slug}/invoices/new` for that client. No modal opens.
- FR-2: The Take Action "Draft invoice" button (`studio-top-section.tsx`) opens a new lightweight `DraftInvoicePickerModal` (shadcn `Dialog`) listing all active clients in a `<select>` (label shows `name` + `company` when present).
- FR-3: The picker's select uses the established `__new__` sentinel: choosing "+ New client…" swaps the select for an inline mini-form (business/project name required, contact name and email optional). Submitting POSTs `/api/projects` with `{ name, type: 'CLIENT', client: { contactName?, email? } }`; on success it navigates to `/projects/{newSlug}/invoices/new`.
- FR-4: With an existing client selected, the picker's primary button ("Continue") navigates to `/projects/{slug}/invoices/new`. The button is disabled until a client is selected.
- FR-5: `src/components/studio/studio-invoice-modal.tsx` is deleted. `StudioClient` loses the `showInvoiceModal` state, the `StudioInvoiceModal` import/render, and the now-unused `paymentMethods`, `invoiceDefaults`, and `hasTransactions` props (all were consumed only by the modal). `src/app/studio/page.tsx` stops fetching `userPreference` and the transaction count, and stops passing those props.
- FR-6: `NewInvoiceShortcuts` loses its now-dead `onSelectProject` prop and stops forwarding it to `FromTransactionsModal`. `FromTransactionsModal` itself is unchanged.
- FR-7: `preselectedClientId` state in `studio-client.tsx` remains only for `LogTimeModal`; the invoice flow no longer touches it.
- FR-8: The `codebase_map.md` Client Hub section is updated: modal row removed, picker added, flow description reflects page navigation.

**Content width (CLIENT project pages)**

- FR-9: Client overview (`/projects/[slug]`): `ProjectPageShell` receives `contentWidth="lg"` **only when `project.type === 'CLIENT'`**; PROPERTY and OTHER branches remain fluid.
- FR-10: Job detail (`/projects/[slug]/jobs/[jobId]`): migrate the inner ad-hoc `<div className="max-w-4xl">` to `contentWidth="lg"` on the shell.
- FR-11: Estimates list (`/projects/[slug]/estimates`): add `contentWidth="lg"` (card-row list; mirrors the quotes-list precedent).
- FR-12: Estimate new (`/projects/[slug]/estimates/new`) and estimate detail (`/projects/[slug]/estimates/[estId]`): migrate inner ad-hoc `max-w-4xl` wrappers to `contentWidth="lg"`.
- FR-13: Quotes list (`/projects/[slug]/quotes`) and quote detail (`/projects/[slug]/quotes/[quoteId]`): migrate inner ad-hoc `max-w-4xl` wrappers to `contentWidth="lg"` (inner `space-y-4` classes are preserved).
- FR-14: These pages stay fluid (no `contentWidth`): jobs list, invoices list, work-orders list, time tracker, financials, quote generator (`/quotes/[quoteId]/generate`).
- FR-15: Constrained columns remain left-aligned; no centering; no width regressions below the cap (the `max-w-*` class only caps width).

## 5. UX & design considerations

- The picker is a small centered shadcn `Dialog` (same primitive as `FromTransactionsModal`), not a slide-over: title "Draft invoice", description "Pick a client — you'll edit the invoice on their page.", a client select, an optional inline new-client form, and Cancel / Continue footer buttons. Copy can be wordsmithed in review.
- Inline new-client mini-form mirrors the deleted modal's three inputs (name / contact / email) and its POST payload, minus the local `ClientOption` bookkeeping — on success we navigate instead of selecting in place.
- Landing page behavior is unchanged and already correct: `/projects/[slug]/invoices/new` renders `NewInvoiceShortcuts` (Create with AI, from accepted quote, from transactions, from past invoice) above the `InvoiceEditor` at `contentWidth="md"`.
- Width choices follow the last commit's precedent: editor pages `md`, detail/overview pages `lg`. Nothing new is introduced — FR-9 through FR-13 only adopt or migrate to the existing prop.
- After navigation, the browser Back button returns to Client Hub — a better trail than closing a modal.

## 6. Acceptance criteria & success metrics

- AC-1: Clicking "Draft invoice" on an expanded client card navigates to `/projects/{slug}/invoices/new` and the invoice editor renders with shortcuts.
- AC-2: Clicking "Draft invoice" in Take Action opens the picker; selecting a client + Continue lands on that client's new-invoice page.
- AC-3: In the picker, "+ New client…" → filling name (+ optional contact/email) → Create lands on the new client's `/projects/{slug}/invoices/new` without a 404 (CLIENT project + ClientProfile created by `POST /api/projects`).
- AC-4: `StudioInvoiceModal` no longer exists; `rg StudioInvoiceModal` returns zero hits; Client Hub renders and behaves identically otherwise (KPIs, notices, cards, other modals).
- AC-5: On a ≥1600px viewport, the client overview, job detail, estimates list/editor, and quotes list/detail render in an 896px left-aligned column; jobs/invoices/work-orders lists, time, financials, and the quote generator remain full-width.
- AC-6: PROPERTY and OTHER project overview pages render unchanged (fluid).
- AC-7: `pnpm lint`, `pnpm test`, and `pnpm build` pass; `content-width.test.ts` still green.
- Success metric (qualitative): one canonical invoice-creation surface (the page); no width sprawl on client detail/form pages; no user reports of "lost the page I was on" after drafting an invoice.

## 7. Out of scope

- Quote-detail "Create invoice" panel; `NewInvoiceShortcuts` shortcut behavior; `FromTransactionsModal` internals.
- Constraining `/studio`, `/portfolio`, dashboard, transactions, pivot, or any PROPERTY/OTHER page.
- Touching invoice send/mark-sent modals, other Take Action modals (client/job/estimate/quote/time/work-order/bill), or the omni agent.
- Changes to `content-width.ts`, the shells, or their existing tests (the prop already does everything needed).
- Any Prisma/API/env changes.

## 8. Open questions & risks

- *Risk:* `src/app/studio/page.tsx` pref cleanup — the `userPreference` fetch and `txCount` query must be verified as used *only* for the removed props before deletion (verified during planning; re-checked at implementation).
- *Risk:* the picker is the third inline client-creation surface; keeping it minimal (3 fields) matches the deleted modal's UX, and the full `NewClientModal` remains the rich path from Take Action → "New client".
- *Risk:* removing `onSelectProject` from `NewInvoiceShortcuts` — its only consumer was the deleted modal; the new-invoice page never passed it. `FromTransactionsModal`'s own optional prop stays.
- *Open:* none blocking. Picker copy (title/description/button labels) final in review.

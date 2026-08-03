# PRD — Invoice payment-method edit link & content-width pattern

**Slug:** `invoice-payment-link-content-width`
**Status:** Approved (pending implementation)
**Date:** 2026-08-03

---

## 1. Problem statement

Two related UX gaps in the invoice flow:

**A. Payment-methods FYI box is a dead end.** The invoice editor (create + edit) renders a read-only `PaymentSummary` box showing the bank/PayPal/Stripe/custom payment details that will appear in the invoice email — but offers no way to jump to where those details are edited. The "On the invoice" preview card (From / Bill to, commit `21bbefc`) established the pattern: From has "Update in Settings →" (deep link), Bill to has inline Edit. The payment box has neither. Separately, the existing From "Update in Settings →" link navigates same-tab **without warning**, silently discarding unsaved invoice edits.

**B. Wide-screen sprawl.** The invoice **edit** page (`/projects/[slug]/invoices/[id]/edit`) and invoice **detail** page (`/projects/[slug]/invoices/[id]`) render at the full width of the viewport. On large/wide screens, form fields, the line-items table, and the detail page's side-by-side "Payment info | Payments" grid spread out unintuitively. Width constraints today are ad-hoc per-page wrapper divs (`max-w-3xl` on create, `max-w-4xl` on estimates/quotes, `max-w-2xl` on settings) with no reusable pattern in the layout shells.

## 2. Goals & non-goals

**Goals**
- G1: Let users jump from the payment-methods FYI box directly to the relevant Settings section, deep-linked (`/settings#payment-methods`).
- G2: Never silently discard unsaved invoice edits — any in-editor navigation to Settings warns first (same-tab, per product decision).
- G3: Make invoice edit + detail pages a comfortable, fixed reading/editing width regardless of screen size.
- G4: Establish a reusable width-constraint pattern on the layout shells (`ProjectPageShell`, `PageShell`) that other pages can adopt later.

**Non-goals**
- Not re-centering or redesigning pages — the constrained column stays left-aligned (matches settings/rules/bank-accounts).
- Not constraining data-dense pages (transactions, pivot, dashboards) — they benefit from fluid width.
- Not migrating estimates/quotes/settings pages off their existing ad-hoc wrappers (documented for follow-up).
- No inline editing of payment methods inside the invoice editor (Settings remains the single edit surface).

## 3. User stories

1. As a freelancer creating an invoice, when I see my bank details in the "Payment methods in email" box and spot a mistake, I want a link that takes me straight to that section in Settings, so I don't hunt for it.
2. As a user with unsaved invoice edits, when I click a Settings link inside the editor, I want to be warned before the page navigates away, so I don't lose my draft.
3. As a user on a wide monitor, I want the invoice edit and detail pages to stay a sensible width, so related elements stay near each other and the page reads as one coherent column.
4. As a developer, I want a `contentWidth` prop on the page shells, so future pages opt into constrained width in one line instead of hand-rolling wrapper divs.

## 4. Functional requirements

**Payment-methods edit link**

- FR-1: When `paymentMethods` are configured, the invoice editor (create + edit) renders an "Update in Settings →" link adjacent to (below, right-aligned) the `PaymentSummary` box.
- FR-2: The link targets `/settings#payment-methods` and navigates same-tab.
- FR-3: Settings gains a `payment-methods` anchor wrapping the "Bank transfer" and "Online payments" sections so the deep link scrolls to them.
- FR-4: The empty-state of `PaymentSummary` ("No payment methods configured. Add them in Settings →") is unchanged (opens in a new tab).

**Unsaved-changes guard**

- FR-5: The invoice form tracks a `dirty` flag: any form-mutating dispatch (line items, tax, dates, currency, notes, job — user or AI-originated) sets it; successful save clears it.
- FR-6: Clicking "Update in Settings →" (payment box, FR-1) or "Update in Settings →" (From section of `InvoicePartiesPreview`) while `dirty` shows a `confirm()` dialog: unsaved changes exist — leave anyway and discard, or cancel to stay and save first.
- FR-7: The guard only intercepts plain left-clicks; modifier clicks (⌘/Ctrl/Shift/middle-click, which open a new tab and preserve state) bypass it.
- FR-8: When not dirty, both links navigate immediately with no dialog.

**Content width**

- FR-9: `ProjectPageShell` accepts optional `contentWidth?: 'md' | 'lg'` (`md` = `max-w-3xl`, `lg` = `max-w-4xl`). When set, the shell wraps everything inside `<main>` (project header, sub-nav, and children) in the constraint div. Default (unset) = current full-width behavior.
- FR-10: `PageShell` accepts the same optional `contentWidth` prop, wrapping `children`.
- FR-11: Invoice create page (`/projects/[slug]/invoices/new`, CLIENT path) uses `contentWidth="md"`; its inner ad-hoc `max-w-3xl` wrapper div is removed.
- FR-12: Invoice edit page (`/projects/[slug]/invoices/[id]/edit`) uses `contentWidth="md"`.
- FR-13: Invoice detail page (`/projects/[slug]/invoices/[id]`) uses `contentWidth="lg"`.
- FR-14: Constrained columns remain left-aligned; no centering.

**Consistency polish (same PR, trivial diffs)**

- FR-15: The send-invoice modal's "Edit payment methods" link and the invoice detail page's "Payment settings" link retarget to `/settings#payment-methods` (both are outside the editor, no dirty state → no guard).

## 5. UX & design considerations

- Link copy mirrors the established pattern: `Update in Settings →`, `text-[10px] text-muted-foreground hover:text-foreground`, placed right-aligned under the `PaymentSummary` box (the box is shared with the send modal and detail page, so the link must NOT be added inside `PaymentSummary` itself — that would duplicate the existing links there).
- Guard copy (native `confirm()`): "You have unsaved changes on this invoice. Leave anyway and discard them?" — OK = navigate (discard), Cancel = stay. Copy must make clear Cancel is the "save your draft first" path.
- Width: `max-w-3xl` (768px) for editor pages matches the existing create-page constraint, so the form looks identical between create and edit. `max-w-4xl` (896px) on detail gives the two-column payments grid breathing room without sprawl.
- No visual regressions on small screens: `max-w-*` only caps width; below the cap, layout is unchanged.

## 6. Acceptance criteria & success metrics

- AC-1: From the invoice editor (create + edit), with payment methods configured, clicking "Update in Settings →" under the payment box lands on `/settings` scrolled to the Bank transfer section.
- AC-2: With an unsaved line-item edit, clicking either "Update in Settings →" link prompts the confirm dialog; Cancel keeps the user on the page with edits intact; OK navigates away.
- AC-3: With no unsaved edits, both links navigate without a dialog.
- AC-4: On a ≥1600px-wide viewport, invoice edit renders in a 768px left-aligned column; invoice detail in an 896px column; create is visually unchanged (still 768px, now via the shell prop).
- AC-5: `pnpm lint`, `pnpm test`, and `pnpm build` pass.
- Success metric (qualitative): user can reach payment settings from the editor in one click; no reports of lost invoice drafts from Settings navigation; wide-screen invoice pages read as a single coherent column.

## 7. Out of scope

- Migrating estimates/quotes/settings/rules/bank-accounts pages to the `contentWidth` prop (they already have working ad-hoc constraints).
- Constraining studio/portfolio/dashboard/transactions/pivot (fluid by design).
- Inline payment-method editing in the editor; changing where payment methods are stored (`UserPreference.data.paymentMethods` stays).
- PROPERTY-workspace invoice page (`PropertyInvoiceNew`) — has its own internal `max-w-2xl`.
- `InvoicePartiesPreview` Bill-to inline edit dialog (already shipped; unchanged).

**Follow-up audit (documented, not this PR):** candidate pages for future `contentWidth` adoption: quote detail/generate, job detail, unit detail, maintenance detail, vendor detail (via `PageShell`), tenant detail. Each needs an individual look — side-by-side layouts (quote generator) may stay fluid.

## 8. Open questions & risks

- *Risk:* `useInvoiceForm`'s `dispatch` is passed to several child components; wrapping it for dirty tracking must not change its call signature (it won't — same `React.Dispatch<InvoiceAction>` type).
- *Risk:* the `dirty` flag doesn't cover the "Payment instructions" textarea, but that's correct — it's preference-backed and saves onBlur independently of the invoice draft.
- *Risk:* AI-applied editor actions also mark dirty — intended (AI changes are unsaved until Save).
- *Open:* none blocking. Copy of the guard dialog approved implicitly via FR-6; can be wordsmithed in review.

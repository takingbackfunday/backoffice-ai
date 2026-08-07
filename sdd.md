# SDD: Download-First Quote Flow Redesign

## Context
- **Request:** The primary way users deliver a quote is downloading the PDF and emailing it themselves. The UI must reflect that (Download = hero action everywhere; in-app email demoted to a secondary option), while still tracking quote progress (DRAFT → SENT → ACCEPTED) because the Client Hub (`/studio`) depends on those statuses (`awaiting-quotes`, `uninvoiced-quotes` filters, KPIs, pipeline strip). Additionally: a general UI overhaul across the entire quote flow — list page, new-quote form, editor, detail page, and all tables.
- **Scope:** Local-to-feature. Multiple files inside the quote feature surface, but **no schema changes and no API contract changes** (the send route already supports `{ markOnly: true }`; the PDF route is unchanged). All work is React component/UI-layer plus one client-side bug fix in the studio modal.

## Decisions confirmed with user
1. In-app email sending is **demoted**, not removed: it moves into an overflow ("More") menu on the detail page, disabled with a tooltip when the client has no email.
2. After a download on the detail page, an **inline banner** appears immediately ("mark as sent?"), explicit click only — downloading never auto-flips status. The existing `/studio` `MarkSentQuoteModal` remains as the fallback catch-all via the existing `pending-mark-sent-quote` localStorage mechanism.
3. Editor's **"Save & Send"** becomes **"Save & Download"** (save → browser download → navigate to detail page with banner open).
4. Full list-page overhaul following the `invoice-list.tsx` pattern (tabs, search, summary strip, grid table, row quick actions), plus visual consistency pass on the detail read-only table and the editor table.

## Bugs found during exploration (folded into this work)
- `src/components/studio/mark-sent-quote-modal.tsx` calls `POST …/send` **without** `{ markOnly: true }` → it actually re-emails the client via Resend (or 400s with "No email address found for this client" when `ClientProfile.email` is null). Fix: send `{ markOnly: true }`.
- `src/components/projects/quote-row-actions.tsx` is dead code (never imported anywhere) and passes `projectSlug` where `/api/projects/[id]/…` expects the workspace `id`. Fix: delete the file.

## Current State

### Pages & components (all verified to exist)
| Surface | Server page | Client component | Notes |
|---|---|---|---|
| List | `src/app/projects/[slug]/quotes/page.tsx` | `src/components/projects/quote-list.tsx` (83 ln) | Bare link-rows; tiny `text-xs` "New Quote" link in page header |
| New | `src/app/projects/[slug]/quotes/new/page.tsx` (60 ln) | `src/components/projects/new-quote-form.tsx` (191 ln) | Pill mode selector (blank/template/duplicate); ad-hoc `max-w-md` wrapper in page (should use shell `contentWidth`) |
| Edit | `src/app/projects/[slug]/quotes/[quoteId]/edit/page.tsx` | `src/app/projects/[slug]/quotes/[quoteId]/edit/quote-edit-client.tsx` (86 ln) → `src/components/projects/quote-editor.tsx` (359 ln) → `src/components/projects/quote-line-items-table.tsx` (225 ln) | Editor header: currency select, "Show costs", "Ask AI", "Save as template", **"Save & Send" (primary)**, "Save". `QuoteEditor` is used **only** by `quote-edit-client.tsx` |
| Detail | `src/app/projects/[slug]/quotes/[quoteId]/page.tsx` (156 ln) | `src/components/projects/quote-detail-client.tsx` (635 ln — already over the 400-line cap) | One row of up to 9 buttons: Delete, Edit, Mark as sent, **Send (primary)**, Mark Accepted / Cancel, Revise / Create Invoice, Add change order + Preview PDF, Download PDF, Duplicate, Save as template |

### Existing download-first infrastructure (keep & extend)
- Detail page Download button already stashes `{ quoteId, quoteNumber, projectId, projectSlug, downloadedAt }` under localStorage key `pending-mark-sent-quote` (DRAFT only) — `quote-detail-client.tsx` lines 345–352.
- `/studio` (`studio-client.tsx` lines 72–81) reads that key (7-day expiry) and pops `MarkSentQuoteModal`, which calls the send route. **This is the fallback; the new inline banner is the primary prompt.**

### API routes (no changes needed)
- `POST /api/projects/[id]/quotes/[quoteId]/send` — accepts `{ message?, markOnly? }`. `markOnly: true` → flips DRAFT/REJECTED → SENT with `sentAt`, no email. Without it → generates PDF, emails via Resend (skipped silently if `RESEND_API_KEY` absent), sets `sentTo`. Returns `{ …quote, emailSent }`.
- `GET /api/projects/[id]/quotes/[quoteId]/pdf` — streams the PDF. Downloaded via hidden-anchor pattern already used in `quote-detail-client.tsx` lines 336–344.
- `PATCH /api/projects/[id]/quotes/[quoteId]` — `authedRoute`, `UpdateQuoteSchema` accepts title/currency/validUntil/terms/notes/sections etc.
- Actions `accept`, `revise`, `cancel`, `duplicate`, `create-invoice` — all existing, unchanged.

### Reference patterns to copy
- **List/table visual language:** `src/components/projects/invoice-list.tsx` — div-grid rows, `rounded-xl border overflow-hidden`, header `bg-muted/40 px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide`, rows `border-t px-4 py-3 hover:bg-muted/10` with odd-row zebra `bg-muted/5`, `tabular-nums` on amounts, tab pill bar (`flex rounded-lg border p-0.5 bg-muted/30 gap-0.5`, active = `bg-background shadow-sm`), search input with left `Search` icon, primary CTA `rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90`.
- **Overflow menu:** `src/components/ui/portal-dropdown.tsx` (`PortalDropdown` + anchor ref) paired with `src/hooks/use-outside-click.ts` using `ignoreSelector: '[data-portal-dropdown]'` (mandatory per CLAUDE.md — do not hand-roll).
- **Status badge map:** `STATUS_STYLES` currently duplicated in `quote-list.tsx` and `quote-detail-client.tsx` — extract to shared module (below).
- **400-line component cap** (CLAUDE.md): extract non-visual logic/leaf JSX into sibling files. The detail client is already 635 lines; this redesign must bring it under 400 by extraction.

## Design

**Principle: Download-first, track-always.** Every surface's hero action is "Download PDF". Status progression stays one explicit click away (inline banner after download; "Mark accepted" as a visible secondary for SENT) so `/studio` numbers stay accurate.

### 1. Quotes list page — full rewrite of `quote-list.tsx`
Mirror `invoice-list.tsx` structure:
- **Pipeline summary strip** (inline in `quote-list.tsx`, like `AgingBar`): `grid grid-cols-3 gap-3` of three `rounded-xl border p-4 bg-muted/20` stat blocks, computed client-side from `quotes`:
  - `Drafts` — count + Σ `totalQuoted` where status = DRAFT (gray label)
  - `Awaiting acceptance` — count + Σ where SENT (blue `#3b82f6` accent)
  - `Accepted` — count + Σ where ACCEPTED or AMENDED (green `#22c55e` accent)
  - Currency: use `quotes[0]?.currency ?? 'USD'` for the strip (same mixed-currency caveat as `AgingBar`; acceptable).
- **Toolbar:** tabs `Open (n)` (DRAFT+SENT) / `Accepted (n)` (ACCEPTED+AMENDED) / `All`; search input filtering `quoteNumber` + `title` + `job.name` (lowercase includes); right-aligned primary `+ New quote` button linking to `/projects/${projectSlug}/quotes/new`.
- **Grid table:** header + rows as `grid grid-cols-[minmax(130px,auto)_1fr_110px_110px_100px_70px]`:
  1. Quote number (`text-sm font-medium text-primary`) + `v{n}` + `amendment` badges (existing markup)
  2. `title` + ` · job.name`, truncated, muted
  3. Total, right-aligned `tabular-nums` (`—` when `totalQuoted` null)
  4. Status pill (shared `QUOTE_STATUS_STYLES`, lowercase label)
  5. Created date (`toLocaleDateString('en-US', { month: 'short', day: 'numeric' })`)
  6. Row actions (`onClick` stopPropagation): **Download icon button** (`Download` from lucide, `p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted`, `title="Download PDF"`) and `Eye` icon Link to detail. Download uses the hidden-anchor pattern against `/api/projects/${projectId}/quotes/${q.id}/pdf`; if `q.status === 'DRAFT'` also stash to `pending-mark-sent-quote` via the new helper (step 6 below) so the studio modal remains the fallback.
- Row click navigates to the detail page (`useRouter().push`); **no preview modal** (deliberately simpler than invoices).
- Empty state: keep dashed box; add the primary `+ New quote` button inside it; copy: "No quotes yet." / "Create one from scratch, from a template, or by duplicating a recent quote."
- Props change: add `projectId: string` (needed for PDF URLs).

`page.tsx` (list): delete the header `New Quote` link block (lines 57–66 wrapper stays as plain `<div>`); pass `projectId={project.id}` to `QuoteList`.

### 2. Quote detail page — restructure `quote-detail-client.tsx` into 4 files
New shared/extracted components:

**a) `src/components/projects/quote-status.ts`** (new, ~15 ln)
```ts
export const QUOTE_STATUS_STYLES: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700', ACCEPTED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700', SUPERSEDED: 'bg-amber-100 text-amber-700', AMENDED: 'bg-purple-100 text-purple-700' }
```
Import from `quote-list.tsx` and detail components; delete the local duplicates.

**b) `src/components/projects/quote-detail-actions.tsx`** (new, ~200 ln) — owns the entire action cluster + status stepper + overflow menu + send-by-email confirm modal. Props: `{ projectId, projectSlug, quote: { id, quoteNumber, title, status, version, isAmendment, clientEmail: string | null }, invoicesCount: number, onAction: (path: string, method?: string, body?: object) => Promise<any>, loading: string | null }`. Contents:
- **Status stepper** (rendered only for DRAFT/SENT/ACCEPTED): three steps `Draft → Sent → Accepted` — horizontal flex, each step a circle icon + label; completed steps `text-green-600` with `CheckCircle2`, current `text-primary font-medium`, future `text-muted-foreground`. REJECTED/SUPERSEDED/AMENDED: no stepper (badge already in header).
- **Buttons by status:**
  - DRAFT → primary `Download PDF` (Download icon); secondary `Edit` (Link); overflow `MoreHorizontal` button: Preview PDF, Send by email…, Duplicate, Save as template, `---` divider, Delete (red).
  - SENT → primary `Download PDF`; secondary `Mark accepted`; overflow: Preview PDF, Send by email…, Revise, Duplicate, Save as template, divider, Cancel quote (red).
  - ACCEPTED/AMENDED → primary `Create Invoice` (opens the existing due-date panel — lift `showCreateInvoice` state up or keep panel in orchestrator and pass an `onCreateInvoice` callback); secondary `Download PDF`; overflow: Preview PDF, Add change order (ACCEPTED only, calls revise), Duplicate, Save as template, divider, Cancel quote (red, only when `invoicesCount === 0`).
- Overflow menu via `PortalDropdown` (anchor = the `MoreHorizontal` button ref, `align="right"`) + `useOutsideClick(menuOpen, close, '[data-portal-dropdown]')`. Menu item classes: `flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left`.
- **Send by email…** opens a small local modal (same markup idiom as `NewQuoteModal`: `fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4`, inner `w-full max-w-sm rounded-xl bg-background border shadow-xl p-5 space-y-4`) with optional message textarea and primary "Send email" → `onAction('send', 'POST', { message })` → on success `router.refresh()`. Menu item is `disabled` + `title="Add a client email address to send directly"` when `!quote.clientEmail`.
- All existing handlers move here unchanged: `handleSend`, `handleAccept`, `handleRevise`, `handleCancel`, `handleDelete`, duplicate fetch, `SaveTemplateModal` open state (modal itself stays rendered by orchestrator; pass `onOpenTemplateModal` callback) — simplest: move `SaveTemplateModal` rendering into this file too, it has `quote.sections` via a new prop; pass `sections` in.

**c) `src/components/projects/quote-download-banner.tsx`** (new, ~90 ln) — the post-download inline prompt. Props: `{ projectId, quoteId, quoteNumber, clientName: string, onDone: () => void }`. Renders a dismissible bar (reuse the `AiConfirmBanner` visual idiom: `rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3`):
- Copy: `PDF downloaded ✓ — attach it to an email to {clientName}. Once it's sent, mark it sent so your pipeline stays accurate.`
- Buttons: primary small `[Mark as sent]` → `POST …/send { markOnly: true }` → remove this quote from `pending-mark-sent-quote` localStorage → `onDone()` (orchestrator does `router.refresh()`); secondary ghost `[Not yet]` → stash/dedupe entry in `pending-mark-sent-quote` → `onDone()`.
- Internal `saving`/`error` state (error text `text-xs text-red-600`).

**d) `src/components/projects/quote-detail-table.tsx`** (new, ~100 ln) — the read-only sections table, restyled: numeric cells get `tabular-nums`; section header rows (when >1 section) show the **section subtotal** right-aligned in the last column (`text-xs font-medium text-muted-foreground`); if any `isOptional` items exist, `tfoot` gains a row above Total: `Optional items (excluded)` + their Σ; Total row unchanged. Props: `{ sections, currency }`.

**Orchestrator `quote-detail-client.tsx`** keeps: header (number/version/badge/title/job), the new banner state, error display, create-invoice panel, fulfillment bar, version chain, details grid, scope notes, payment schedule, terms, invoices, amendments, PDF preview modal. Changes:
- Delete the 9-button row and `STATUS_STYLES`; render `<QuoteDetailActions … />`, `<QuoteDetailTable … />`.
- New state `showSentBanner`, initialized from new prop `initialShowSentBanner: boolean`.
- Download handler (now inside actions component triggers `onDownloaded` callback): if `quote.status === 'DRAFT'` → `setShowSentBanner(true)`; **remove** the old direct localStorage write (the banner owns stash-on-"Not yet" now). For non-DRAFT statuses nothing changes.
- Render `{showSentBanner && quote.status === 'DRAFT' && <QuoteDownloadBanner … onDone={() => { setShowSentBanner(false); router.refresh() }} />}` directly under the header.
- Must end up < 400 lines (CLAUDE.md cap).

`[quoteId]/page.tsx`: accept `searchParams: Promise<{ downloaded?: string }>`; compute `initialShowSentBanner = (await searchParams).downloaded === '1' && quote.status === 'DRAFT'`; pass it + `clientProfile.email` is already in `quoteData` (pass through to actions as `clientEmail`).

### 3. Quote editor — `quote-editor.tsx` + `quote-edit-client.tsx`
- `quote-editor.tsx`: rename prop `onSaveAndSend` → `onSaveAndDownload`; swap the primary button: `<Download className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save & Download'}` (import `Download` instead of `Send` from lucide). Button order (right cluster): currency, Show costs, Ask AI, Save as template, `Save` (secondary border), **`Save & Download`** (primary, rightmost). Nothing else changes (HITL, `useQuoteForm`, sections, terms, totals untouched).
- `quote-edit-client.tsx`: rename `handleSaveAndSend` → `handleSaveAndDownload`; new body: (1) `PATCH` save (existing code); (2) trigger download with the hidden-anchor pattern (`a.href = /api/projects/${projectId}/quotes/${initialData.id}/pdf`, `a.download = ${initialData.quoteNumber ?? 'quote'}.pdf`); (3) `router.push(`/projects/${projectSlug}/quotes/${initialData.id}?downloaded=1`)` (no `router.refresh()` needed — push re-renders the server page). Remove the old second `POST …/send` call entirely.
- `quote-line-items-table.tsx` (visual consistency only): header cells → `text-[10px] font-semibold uppercase tracking-wide`; add `tabular-nums` to the qty/unitPrice/costRate inputs; add `focus:bg-muted/30 rounded` to borderless inputs. No behavioral changes.

### 4. New quote page — `new-quote-form.tsx` + `new/page.tsx`
- `new/page.tsx`: remove the `<div className="max-w-md">` wrapper; pass `contentWidth="md"` to `ProjectPageShell` (per CLAUDE.md content-width rule).
- `new-quote-form.tsx`: replace the three mode pills with a `grid grid-cols-3 gap-2` of card buttons (`rounded-xl border p-3 text-left`, selected = `border-primary bg-primary/5`, unselected = `text-muted-foreground hover:bg-accent`), each with a lucide icon + label + one-line blurb: `FilePlus2` "From scratch / Empty quote", `LayoutTemplate` "From template / Reuse a saved structure", `Copy` "Duplicate recent / Copy an existing quote". All submit logic, fields, and `JobSelect` usage stay identical.

### 5. Studio modal fix — `mark-sent-quote-modal.tsx`
In `handleMarkSent`, change the fetch to:
```ts
const res = await fetch(`/api/projects/${item.projectId}/quotes/${item.quoteId}/send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ markOnly: true }),
})
```
Nothing else in the modal changes. (This stops the accidental re-email and the 400 for clients without email.)

### 6. Shared localStorage helper — `src/lib/pending-mark-sent.ts` (new, ~30 ln)
```ts
export interface PendingMarkSentQuote { quoteId: string; quoteNumber: string; projectId: string; projectSlug: string; downloadedAt: number }
const KEY = 'pending-mark-sent-quote'
export function stashPendingMarkSentQuote(entry: PendingMarkSentQuote): void // read, dedupe by quoteId, push, write; wrapped in try/catch
export function removePendingMarkSentQuote(quoteId: string): void // filter out, write; try/catch
```
Use in: `quote-list.tsx` (download action, DRAFT only), `quote-download-banner.tsx` ("Not yet" → stash; "Mark as sent" success → remove). Client-only module — call sites are all `'use client'`.

### 7. Cleanup
- Delete `src/components/projects/quote-row-actions.tsx` (dead code, wrong param).

### 8. Capabilities sidecars (must update + regenerate per codebase_map.md)
- `src/app/projects/[slug]/quotes/page.capabilities.ts` — jobsToBeDone: add "Download quote PDFs to send via your own email"; change "Navigate to a quote to view, edit, or send it" → "…view, edit, download, or track it".
- `src/app/projects/[slug]/quotes/[quoteId]/page.capabilities.ts` — change job "Send the quote to the client by email" → "Download the quote PDF and mark it sent (optional: send by email)".
- `src/app/projects/[slug]/quotes/[quoteId]/edit/page.capabilities.ts` — change "Save draft or save and send the quote to the client" → "Save draft or save and download the quote PDF".
- `src/app/projects/[slug]/quotes/new/page.capabilities.ts` — remove stale relatedRoute `/projects/[slug]/quotes/[quoteId]/generate` (route no longer exists).
- Run `pnpm run build:capabilities` to regenerate `src/lib/agent/site-capabilities.generated.ts`.

## Plan
1. Add `src/lib/pending-mark-sent.ts` (helper) and `src/components/projects/quote-status.ts` (shared styles).
2. Rewrite `src/components/projects/quote-list.tsx` (summary strip, tabs, search, grid table, row download) and update `src/app/projects/[slug]/quotes/page.tsx` (remove header link, pass `projectId`).
3. Create `quote-detail-actions.tsx`, `quote-download-banner.tsx`, `quote-detail-table.tsx`; slim `quote-detail-client.tsx` to orchestrate them; wire `initialShowSentBanner` + `?downloaded=1` through `src/app/projects/[slug]/quotes/[quoteId]/page.tsx`.
4. Editor: prop rename + button swap in `quote-editor.tsx`; new `handleSaveAndDownload` in `quote-edit-client.tsx`; visual pass on `quote-line-items-table.tsx`.
5. New-quote page: `contentWidth="md"` in `new/page.tsx`; card-grid mode selector in `new-quote-form.tsx`.
6. Fix `mark-sent-quote-modal.tsx` (`markOnly: true`).
7. Delete `quote-row-actions.tsx`.
8. Update the four `page.capabilities.ts` sidecars; run `pnpm run build:capabilities`.
9. Validate: `pnpm lint` → `pnpm test` → `DIRECT_URL="postgresql://x:x@localhost/x" pnpm build` (dummy DIRECT_URL per CLAUDE.md). Manual smoke: (a) list tabs/search/download; (b) detail download → banner → Mark as sent flips to SENT and shows in `/studio` awaiting-acceptance; (c) "Not yet" → visit `/studio` → modal appears → marks sent without sending email; (d) editor Save & Download lands on detail with banner; (e) Send by email menu item disabled when client has no email; (f) accepted quote → Create Invoice panel still works.

## Files Changed
- `src/lib/pending-mark-sent.ts` — **new**: localStorage stash/remove helpers.
- `src/components/projects/quote-status.ts` — **new**: shared `QUOTE_STATUS_STYLES`.
- `src/components/projects/quote-list.tsx` — full rewrite (strip/tabs/search/grid/download).
- `src/app/projects/[slug]/quotes/page.tsx` — remove header link; pass `projectId`.
- `src/components/projects/quote-detail-actions.tsx` — **new**: stepper + action cluster + overflow + send-by-email modal.
- `src/components/projects/quote-download-banner.tsx` — **new**: post-download mark-as-sent banner.
- `src/components/projects/quote-detail-table.tsx` — **new**: read-only items table w/ section subtotals + optional-excluded row.
- `src/components/projects/quote-detail-client.tsx` — slim to orchestrator (<400 ln); banner state; remove button row/table/STATUS_STYLES.
- `src/app/projects/[slug]/quotes/[quoteId]/page.tsx` — read `searchParams.downloaded`; pass `initialShowSentBanner`.
- `src/components/projects/quote-editor.tsx` — `onSaveAndSend`→`onSaveAndDownload`; primary button "Save & Download" (Download icon).
- `src/app/projects/[slug]/quotes/[quoteId]/edit/quote-edit-client.tsx` — save → download → push `?downloaded=1`.
- `src/components/projects/quote-line-items-table.tsx` — header/number/input focus styling only.
- `src/app/projects/[slug]/quotes/new/page.tsx` — `contentWidth="md"`, drop `max-w-md` div.
- `src/components/projects/new-quote-form.tsx` — card-grid mode selector.
- `src/components/studio/mark-sent-quote-modal.tsx` — `markOnly: true` fix.
- `src/components/projects/quote-row-actions.tsx` — **deleted**.
- 4× `page.capabilities.ts` + regenerated `src/lib/agent/site-capabilities.generated.ts`.

## Execution Readiness
- Executor only needs targeted lookups in referenced files: **yes** (every change names its file; referenced patterns — `invoice-list.tsx`, `PortalDropdown`, `AiConfirmBanner`, `NewQuoteModal` — are named as copy sources).
- Executor does not need open-ended codebase exploration: **yes**.
- Executor does not need product/requirements clarification: **yes** (all 4 product decisions confirmed by user).
- Executor does not need to make unresolved design decisions: **yes** (copy strings, column layouts, class patterns, and state flow are specified; minor spacing within stated patterns is the only latitude).
- Chosen approach, files, symbols, commands, and validation steps are explicit: **yes**.

## Risks / Open Questions
- **Mixed currencies** in the list summary strip: sums assume one currency (uses `quotes[0]?.currency`), same accepted caveat as the invoice `AgingBar`.
- **Anchor download + immediate `router.push`**: same-origin download via `<a download>` survives App Router navigation (browser download manager owns it) — already the established pattern in the current detail page. If a browser ever cancels it, fallback is: push first, then auto-click download on the detail page when `?downloaded=1` is present (only change if smoke test (d) fails).
- **`quote-detail-client.tsx` line budget**: if extraction lands slightly over 400 lines, next candidate to extract is the create-invoice panel into its own file — do not leave the file over the cap.
- **Studio hub visuals are out of scope**: hub consumes statuses only; no UI change needed there beyond the modal fix.
- Out of scope (unchanged): quote PDF layout (`src/lib/pdf/quote-pdf.tsx`), margin rules, templates system, invoice flow, all API routes.

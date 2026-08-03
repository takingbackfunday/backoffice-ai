# SDD — Invoice payment-method edit link & content-width pattern

**Slug:** `invoice-payment-link-content-width`
**PRD:** `docs/prd/invoice-payment-link-content-width.md`
**Status:** Approved (pending implementation)
**Date:** 2026-08-03

---

## 1. Architecture overview

Purely client/UI-layer work in the existing Next.js App Router stack. No Prisma schema changes, no new API routes, no new env vars.

Two independent workstreams:

- **A. Payment-methods edit link + unsaved-changes guard** — touches the invoice editor component tree (`invoice-editor.tsx` → `invoice-parties-preview.tsx` + `invoice-form-fields.tsx`), the form state hook (`hooks/use-invoice-form.ts`), the settings form (`payment-settings-form.tsx`), plus two trivial link retargets (`send-invoice-modal.tsx`, `invoice-detail-client.tsx`). Introduces one new shared primitive (`GuardedLink`) and one pure helper (`confirmLeaveWithChanges`).
- **B. Content-width pattern** — adds an optional `contentWidth` prop to both layout shells (`project-page-shell.tsx`, `PageShell`) backed by a pure mapping module (`content-width.ts`), then opts the three invoice pages in.

## 2. Data model changes

None. Payment methods continue to live in `UserPreference.data.paymentMethods` (edited via the existing Settings form → `POST /api/preferences`). No `db:push`, no migration, no enum changes.

## 3. API design

No new or changed API routes. Existing routes relied on (unchanged):

- `POST /api/preferences` — settings form save (already used today).
- `PATCH /api/projects/[id]` — Bill-to inline edit (already shipped in `21bbefc`; untouched).

## 4. File-by-file change plan

Implementation order matters within Workstream A (hook first, consumers after). Workstream B is independent of A.

### Workstream A — payment link + guard

**A1. `src/lib/unsaved-guard.ts`** *(new, ~20 lines)* — pure, testable logic:
```ts
export const UNSAVED_INVOICE_MESSAGE =
  'You have unsaved changes on this invoice. Leave anyway and discard them?'

/** Returns true when navigation should proceed. `confirmFn` injected for testability. */
export function confirmLeaveWithChanges(dirty: boolean, confirmFn: (msg: string) => boolean): boolean
```
- `dirty === false` → `true` immediately; otherwise delegates to `confirmFn(UNSAVED_INVOICE_MESSAGE)`.

**A2. `src/lib/unsaved-guard.test.ts`** *(new)* — colocated Vitest:
- not dirty → `true`, `confirmFn` never called
- dirty + confirm true → `true`, called once with the message
- dirty + confirm false → `false`

**A3. `src/components/ui/guarded-link.tsx`** *(new, ~45 lines)* — shared client primitive:
```tsx
'use client'
interface GuardedLinkProps {
  href: string
  dirty: boolean
  children: React.ReactNode
  className?: string
}
```
- Renders `next/link` with an `onClick` that:
  - Ignores non-plain clicks: `e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0` → return (new-tab clicks preserve form state; FR-7).
  - Else `if (!confirmLeaveWithChanges(dirty, window.confirm.bind(window))) e.preventDefault()`.
- No `useState`/hooks needed beyond the handler; keep under the 400-line cap trivially.

**A4. `src/components/projects/hooks/use-invoice-form.ts`** *(edit, ~+12 lines)* — dirty tracking:
- Add `const [dirty, setDirty] = useState(false)`.
- Wrap the reducer dispatch: `const trackedDispatch: React.Dispatch<InvoiceAction> = useCallback((action) => { setDirty(true); dispatch(action) }, [])` and return `trackedDispatch` as `dispatch` (same type — all existing call sites in `InvoiceFormFieldsTop/Bottom`, `LineItemsTable`, `applyEditorAction`, `copyFromInvoice`, `undoAiChanges` work unchanged; AI actions correctly count as dirty).
- In `handleSave`, on success (after `invoiceId` is known): `setDirty(false)` before returning.
- Return `dirty` in the hook's result object.
- Note: `paymentInstructions` lives outside the reducer in `invoice-editor.tsx` and saves onBlur — intentionally excluded from dirty (PRD §8).

**A5. `src/components/projects/invoice-editor.tsx`** *(edit, ~+3 lines)*:
- Pass `dirty={form.dirty}` to `<InvoicePartiesPreview>` and `<InvoiceFormFieldsBottom>`.

**A6. `src/components/projects/invoice-parties-preview.tsx`** *(edit, ~+6 lines)*:
- Add `dirty?: boolean` to `InvoicePartiesPreviewProps` (default `false`).
- Replace the From-section `<Link href="/settings#business-profile">Update in Settings →</Link>` with `<GuardedLink dirty={dirty} …>` (same className). Bill-to Edit button unchanged (opens dialog, no navigation).

**A7. `src/components/projects/invoice-form-fields.tsx`** *(edit, ~+10 lines)* — `InvoiceFormFieldsBottom`:
- Add `dirty?: boolean` to `InvoiceFormFieldsBottomProps`.
- In the payment-methods block (currently lines 303–307), render under the `<PaymentSummary>`:
  ```tsx
  <div className="mt-1 flex justify-end">
    <GuardedLink href="/settings#payment-methods" dirty={!!dirty}
      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
      Update in Settings →
    </GuardedLink>
  </div>
  ```
- Do NOT add the link inside `PaymentSummary` (shared with send modal + detail page which have their own links — PRD §5).

**A8. `src/components/settings/payment-settings-form.tsx`** *(edit, ~+2 lines)*:
- Wrap the `<Section title="Bank transfer">` and `<Section title="Online payments">` blocks in `<div id="payment-methods" className="space-y-4">…</div>` (parent already `space-y-4`, so visual spacing is preserved). "Business profile" / notes / payment-instructions sections stay outside the wrapper.

**A9. `src/components/projects/send-invoice-modal.tsx`** *(edit, 1 line)*:
- `<Link href="/settings">Edit payment methods</Link>` → `href="/settings#payment-methods"`. No guard (modal opens only after the invoice is saved).

**A10. `src/components/projects/invoice-detail-client.tsx`** *(edit, 1 line)*:
- "Payment settings" link → `href="/settings#payment-methods"`. (File is pre-existing >400 lines; a one-line href change does not worsen this — no refactor in scope.)

### Workstream B — content width

**B1. `src/components/layout/content-width.ts`** *(new, ~15 lines)* — pure mapping:
```ts
export type ContentWidth = 'md' | 'lg'
export function contentWidthClass(width?: ContentWidth): string | undefined
// 'md' → 'max-w-3xl', 'lg' → 'max-w-4xl', undefined → undefined
```

**B2. `src/components/layout/content-width.test.ts`** *(new)* — colocated Vitest for the mapping (all three branches).

**B3. `src/components/layout/project-page-shell.tsx`** *(edit, ~+8 lines)*:
- Add `contentWidth?: ContentWidth` to `ProjectPageShellProps`.
- Inside `<main>`, when `contentWidth` is set, wrap `<ProjectDetailHeader>`, `<ProjectSubNav>`, and `children` in `<div className={contentWidthClass(contentWidth)}>` (import `cn` not needed — single class; use plain template). When unset, render exactly as today.

**B4. `src/components/layout/page-shell.tsx`** *(edit, ~+5 lines)*:
- Same prop; wraps `{children}` inside `<main>` when set.

**B5. `src/app/projects/[slug]/invoices/new/page.tsx`** *(edit, ~3 lines)*:
- CLIENT path: add `contentWidth="md"` to `<ProjectPageShell>`; remove the inner `<div className="max-w-3xl">` wrapper (line 106), keeping `<NewInvoiceShortcuts>` + `<InvoiceEditor>` as direct children. PROPERTY path untouched (`PropertyInvoiceNew` has its own internal `max-w-2xl`).

**B6. `src/app/projects/[slug]/invoices/[invoiceId]/edit/page.tsx`** *(edit, 1 line)*:
- Add `contentWidth="md"` to `<ProjectPageShell>`.

**B7. `src/app/projects/[slug]/invoices/[invoiceId]/page.tsx`** *(edit, 1 line)*:
- Add `contentWidth="lg"` to `<ProjectPageShell>`.

## 5. Reuse map

| Existing module | How it's reused |
|---|---|
| `src/components/projects/payment-summary.tsx` | Rendered as-is; link placed adjacent, never inside (shared with send modal + detail page) |
| `src/components/projects/invoice-parties-preview.tsx` | Established "Update in Settings →" pattern + `/settings#business-profile` anchor precedent (commit `21bbefc`) |
| `src/components/settings/payment-settings-form.tsx` `Section` `id` prop | Anchor mechanism precedent (`#invoice-notes-default`, `#payment-instructions`) |
| `next/link` | Base of `GuardedLink` |
| `src/lib/utils.ts` `cn` | Class merging where needed |
| `useInvoiceForm` reducer/`dispatch` | Dirty tracking wraps existing dispatch — no call-site changes |
| `src/components/layout/project-page-shell.tsx` / `page-shell.tsx` | The two shells get the opt-in prop; all other pages unaffected by default |

## 6. Edge cases & error handling

- **Modifier/new-tab clicks** bypass the guard (FR-7) — opening Settings in a new tab never discards state, so warning would be noise.
- **Not-dirty navigation** is instant, no dialog (FR-8) — e.g., opening the editor and clicking straight through.
- **AI-applied edits** (`applyEditorAction`) and **copy-from-invoice** dispatch through the wrapped dispatch → correctly marked dirty.
- **Successful save clears dirty** — after `Save as draft`/`Save changes`, immediate navigation to Settings from the *detail* page isn't guarded anyway (different page), but the flag is correct if the user navigates back.
- **Empty payment methods**: `PaymentSummary` empty state (amber box, `target="_blank"`) unchanged.
- **Anchor scroll**: `/settings#payment-methods` works on full page load (server-rendered HTML contains the `id`). In-app `<Link>` navigation to a hash on a different route triggers Next's default hash scroll.
- **Width on small viewports**: `max-w-*` only caps — mobile/narrow layouts identical to today.
- **Other pages using the shells**: default (no prop) renders byte-identical markup to today — zero regression risk for the ~20 other shell consumers.
- **`undoAiChanges` dispatches** → re-marks dirty even if the undo restores the initial values. Accepted (conservative: may warn when technically back to initial; harmless).

## 7. Testing strategy

Colocated Vitest, pure logic only (repo convention — no jsdom/RTL):

- `src/lib/unsaved-guard.test.ts` — `confirmLeaveWithChanges`: 3 branches (not dirty; dirty+confirm; dirty+cancel), assert message passed through.
- `src/components/layout/content-width.test.ts` — `contentWidthClass`: 'md', 'lg', undefined.

No tests for component wiring (per repo convention). Manual/CI verification: `pnpm lint`, `pnpm test`, `pnpm build` (build because shell + page changes touch server components; no Prisma changes so `prisma generate` runs but schema is unchanged). `pnpm run build:capabilities --check` not needed — no pages added/removed and sidecars (`page.capabilities.ts`) unchanged.

## 8. Rollout notes

- No env vars, no DB migration, no `db:push`, no Fly.io build args.
- Per repo git workflow: commit locally, **do not push** unless the user asks.
- Deploy: standard (push to `main` → GitHub Actions → Fly.io) whenever the user chooses to push. No coordination needed with data migrations.
- Follow-up (documented in PRD §7): audit of other pages for future `contentWidth` adoption.

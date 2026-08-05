# SDD — Invoice templates + always-on live preview on the Settings page

PRD: `docs/prd/invoice-templates-live-preview.md`

## 1. Architecture overview

Two independent halves:

- **Render layer (server):** the invoice PDF generator gains a `template` concept. Six
  header-arrangement variants + an optional footer logo, all sharing the existing
  typography and neutral palette. Selection lives in `UserPreference.data` (JSON — no
  Prisma schema change) and is injected at every `generateInvoicePdf` call site, alongside
  a `showBusinessName` flag that suppresses the header text name when a logo is present.
- **Settings UX (client):** `PaymentSettingsForm` already owns every invoice-visible
  field in local state and already has a `buildPayload()` covering all of them. We add a
  debounced effect that POSTs that payload to the existing
  `/api/settings/preview-invoice` route and renders the returned PDF in a persistent
  sticky panel to the right of the form — replacing the click-to-open modal. The template
  picker and show-name checkbox are just two more fields in the same payload, so the
  preview stays truthful through the exact same code path.

No new API routes, no new Prisma models, no new env vars. Fits the existing stack as-is.

## 2. Data model changes

**None at the Prisma level.** Two new keys in `UserPreference.data` JSON
(`src/types/preferences.ts`):

```ts
invoiceTemplate?: InvoiceTemplateId        // default 'top-left' when absent
invoiceShowBusinessName?: boolean          // default true when absent
```

`POST /api/preferences` (`src/app/api/preferences/route.ts`) shallow-merges arbitrary
top-level keys already — **no route change needed**. Note its `null`-deletes-key
convention: the client should always send concrete values for these two keys (never
`null`), so defaults resolve via `??` fallbacks at read time.

- No `pnpm db:push`, no migration, no backfill — absent keys = current behavior (US4/AC6).

## 3. API design

### 3.1 `POST /api/settings/preview-invoice` — extend body (same route file)

Current body type (lines 13–24 of `src/app/api/settings/preview-invoice/route.ts`) gains:

```ts
invoiceTemplate?: InvoiceTemplateId
invoiceShowBusinessName?: boolean
invoiceNotesDefault?: string
```

Resolution mirrors the existing `logoUrl` fallback pattern (body wins; else prefs; else
default):

```ts
const template   = body.invoiceTemplate ?? prefsData.invoiceTemplate ?? DEFAULT_INVOICE_TEMPLATE
const showName   = body.invoiceShowBusinessName ?? prefsData.invoiceShowBusinessName ?? true
const notes      = (body.invoiceNotesDefault ?? prefsData.invoiceNotesDefault) || 'Thank you for your business.'
const currency   = prefsData.invoiceDefaults?.currency ?? prefsData.dashboardCurrency ?? 'USD'
```

Validate `template` against the `INVOICE_TEMPLATES` id list; unknown → default. Pass
`template` / `showBusinessName` into the `PdfInvoice` literal and `notes`/`currency` into
the sample invoice. Keep the route's manual auth pattern (it returns a binary PDF, not the
JSON `ok()` shape — `authedRoute` does not fit).

Hardening (small, in-scope): wrap `fetchImageAsDataUri(logoUrl)` in try/catch →
`logoDataUri = null` on failure so a broken logo URL never 500s the live preview.

### 3.2 Four production call sites — add two fields

Each already does `parsePreferences(prefs?.data)`; add to the `PdfInvoice` literal:

```ts
template: prefsData.invoiceTemplate,
showBusinessName: prefsData.invoiceShowBusinessName,
```

- `src/app/api/projects/[id]/invoices/[invoiceId]/pdf/route.ts` (~line 53)
- `src/app/api/projects/[id]/invoices/[invoiceId]/send/route.ts` (~line 68)
- `src/app/api/projects/[id]/invoices/[invoiceId]/remind/route.ts` (~line 67)
- `src/app/api/projects/[id]/applicants/[applicantId]/send-invoice/route.ts` (~line 47)

## 4. File-by-file change plan

Implementation order = the order below. Subtask A = steps 1–6 (+11), subtask B = 7–12.

### 1. NEW `src/lib/pdf/invoice-templates.ts`

Single source of truth for template metadata:

```ts
export type InvoiceTemplateId =
  | 'top-left' | 'top-center' | 'top-right' | 'banner' | 'inline' | 'footer-logo'

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateId = 'top-left'

export const INVOICE_TEMPLATES: { id: InvoiceTemplateId; label: string; blurb: string }[] = [
  { id: 'top-left',    label: 'Classic',        blurb: 'Logo above your details, title on the right' },
  { id: 'top-center',  label: 'Centered',       blurb: 'Logo and details centered at the top' },
  { id: 'top-right',   label: 'Right-aligned',  blurb: 'Logo top-right, title on the left' },
  { id: 'banner',      label: 'Banner',         blurb: 'Full-width band with your logo and name' },
  { id: 'inline',      label: 'Compact',        blurb: 'Logo and name side by side in one row' },
  { id: 'footer-logo', label: 'Footer logo',    blurb: 'Text-only header, logo pinned in the footer' },
]

export function isInvoiceTemplateId(v: unknown): v is InvoiceTemplateId { … }
```

### 2. `src/types/preferences.ts`

Add the two keys to `UserPreferenceData` (`import type { InvoiceTemplateId } from
'@/lib/pdf/invoice-templates'` — type-only, no runtime cycle).

### 3. NEW `src/lib/pdf/invoice-pdf-headers.tsx`

Extract all header rendering out of `invoice-pdf.tsx` (that file is already 477 lines —
do not grow it; this extraction should shrink it):

- `InvoiceHeader({ invoice, template, hideName })` — switch on `template`, one internal
  component per variant. All variants reuse the existing style primitives (`fromName`,
  `invoiceLabel`, `invoiceNum`, `metaValue`…); pass the shared stylesheet in or re-declare
  the small subset locally. Neutral palette only; banner band uses `#f5f5f5` (same gray as
  `tableHeader`).
  - `top-left`: today's markup verbatim (logo 140×56 above name/details; right block
    INVOICE + number).
  - `top-center`: centered column — logo, name, detail lines, then INVOICE + number below.
  - `top-right`: mirror of `top-left` — left block holds INVOICE + number; right block is
    right-aligned logo above name/details.
  - `banner`: full-width `backgroundColor: '#f5f5f5'` band (negative horizontal margin to
    bleed to page padding edge, or simply full content width) containing logo left +
    name/details; INVOICE + number row beneath the band.
  - `inline`: one row — logo (~44px height), name + details immediately right of it;
    INVOICE + number far right.
  - `footer-logo`: `top-left` layout **without** the logo element (text-only header).
- `FooterLogo({ invoice })` — logo block (max ~120×48, left-aligned, 8px bottom margin)
  rendered at the top of `FooterBlocks` when `template === 'footer-logo' && logoUrl`, so
  the logo pins to the bottom of every page via the existing fixed-footer machinery and
  flows in-line on the last page like the other footer blocks.
- `hideName === true` suppresses the `fromName` `Text` element in every variant (detail
  lines — address/email/phone/website/VAT — always render).

### 4. `src/lib/pdf/invoice-pdf.tsx`

- `PdfInvoice` gains `template?: InvoiceTemplateId; showBusinessName?: boolean`.
- In `InvoicePDF`: `const template = invoice.template ?? DEFAULT_INVOICE_TEMPLATE` and
  `const hideName = invoice.showBusinessName === false && !!invoice.logoUrl`
  (renderer-level guard: no logo ⇒ name always renders, regardless of stored pref).
- Replace the inline header JSX (lines ~314–332) with
  `<InvoiceHeader invoice template hideName />`; delete the moved markup.
- `FooterBlocks` accepts `template` and renders `<FooterLogo>` per above.
- `estimateFooterHeight` gains the template parameter: when footer-logo + logoUrl, add
  ~64 (logo height + margin) so line items never collide with the pinned logo.
- Keep the multi-pass `generateInvoicePdf` logic untouched.

### 5. `src/app/api/settings/preview-invoice/route.ts`

Per §3.1: extend body type, resolve fallbacks, validate template id, pass into
`generateInvoicePdf`, try/catch around `fetchImageAsDataUri`, currency + notes per §3.1.

### 6. Four production routes (§3.2)

Two added lines each. No other changes.

### 7. NEW `src/components/settings/hooks/use-live-invoice-preview.ts`

```ts
export function useLiveInvoicePreview(payloadJson: string): {
  previewUrl: string | null
  updating: boolean
  previewError: string | null
}
```

- Caller passes `JSON.stringify(buildPayload())` — stable string dep for the effect.
- First call fires immediately (no debounce) so the panel populates on page load;
  subsequent payload changes debounce 800 ms.
- Implementation: `useEffect` on `[payloadJson]` → `setTimeout` (skipped/0 ms when
  `previewUrl` is null) → `AbortController` → `POST /api/settings/preview-invoice` with
  the parsed payload → `res.blob()` → `URL.createObjectURL` → swap state, revoke the
  previous blob URL via a ref. Effect cleanup: `clearTimeout` + `abort()`. Revoke the
  last URL on unmount.
- `updating` true from fetch start until settle; on error set `previewError` and keep the
  last good URL. Non-OK response → treat as error.

### 8. NEW `src/components/settings/invoice-template-picker.tsx`

- Props: `value: InvoiceTemplateId`, `onChange(id)`, plus show-name trio
  (`showBusinessName: boolean`, `onShowBusinessNameChange(v)`, `hasLogo: boolean`).
- Radio-card grid (2 cols × 3 rows, `gap-2`): each card is a `button[type=button]` with a
  ~64×88 div wireframe of the layout (tiny absolutely-positioned gray blocks for logo /
  name / title — pure divs, no images), the label beneath, `ring-2 ring-primary` when
  selected. Wireframe blocks: `bg-gray-300` for logo, `bg-gray-200`/`h-1` bars for text.
- Below the grid: the "Show business name on invoice" checkbox. When `!hasLogo`, render
  it checked + disabled with hint text: *"Upload a logo to hide the text name — the logo
  then carries your invoice identity."*

### 9. NEW `src/components/settings/invoice-preview-panel.tsx`

- Props: `previewUrl: string | null`, `updating: boolean`, `error: string | null`.
- Sticky aside (`lg:sticky lg:top-6`), width ~`lg:w-[420px] xl:w-[480px] shrink-0`.
- Header row: "Invoice preview" label + (`Updating…` spinner text when `updating`).
- Body: `iframe` of `previewUrl` (A4-ish: `aspect-[210/297]`, `w-full`, white bg, border).
  While `!previewUrl && !error`: skeleton placeholder ("Generating preview…"). On
  `error` with no URL: error note. Old URL stays rendered while a new one generates —
  no blank flash.

### 10. `src/components/settings/payment-settings-form.tsx`

Currently 329 lines — must stay < 400 after edits (net change is close to neutral).

- Add state: `template` (init from new prop `initialTemplate`), `showBusinessName`
  (init from `initialShowBusinessName ?? true`).
- `buildPayload()` gains `invoiceTemplate: template`,
  `invoiceShowBusinessName: showBusinessName`, `invoiceNotesDefault: notesDefault || null`
  (already sends `invoiceNotesDefault` — just ensure the preview payload includes it; the
  same payload object is reused for both save and preview).
- Call `useLiveInvoicePreview(JSON.stringify(buildPayload()))` — note: `buildPayload()`
  is already a pure function of state; calling it during render for the stringify is
  fine and cheap.
- Remove: `previewing`/`previewUrl` state, `handlePreview`, `closePreview`, the
  "Preview invoice" button, and the entire modal JSX block (~lines 96–97, 149–172,
  284–291, 296–326).
- New `<Section title="Invoice template" id="invoice-template">` after "Business
  profile", rendering `<InvoiceTemplatePicker … hasLogo={!!logoUrl} />`.
- Logo-removal edge: in the `LogoUpload onChange` callback, if the new URL is null, also
  `setShowBusinessName(true)` (checkbox force-reset per §8).
- Return layout becomes:

```tsx
<div className="flex flex-col lg:flex-row gap-8 items-start">
  <div className="space-y-4 max-w-xl flex-1 min-w-0">{sections + save row}</div>
  <InvoicePreviewPanel previewUrl updating error />
</div>
```

### 11. `src/app/settings/page.tsx`

- Read `data.invoiceTemplate` / `data.invoiceShowBusinessName`; pass as
  `initialTemplate` / `initialShowBusinessName`.
- `<main>`: drop `max-w-2xl` (form manages its own two-column width); keep
  `<AiFeaturesForm>` wrapped in a `max-w-xl` div so it aligns with the form's left
  column.

### 12. `src/app/settings/page.capabilities.ts`

- `purpose`: mention invoice template/layout selection and the live preview.
- `jobsToBeDone`: add "Choose an invoice template (logo placement) and toggle the text
  business name".
- `deepLinks`: add `'invoice-template': '#invoice-template'` (existing stale entries can
  be left as-is).
- Then run `pnpm run build:capabilities` to regenerate
  `src/lib/agent/site-capabilities.generated.ts`.

### 13. Tests — extend `src/lib/pdf/invoice-pdf.test.tsx`

Reuse the existing `countPages` / `extractText` / `occurrences` helpers. Add a 1×1 PNG
data-URI constant for `logoUrl` (react-pdf needs a decodable image).

- Loop over `INVOICE_TEMPLATES`: minimal invoice + logo → valid `%PDF`, 1 page.
- Default (no template field): `occurrences(text, 'Studio One') === 2` (header name +
  footer attribution on a 1-page invoice).
- `showBusinessName: false` **with** `logoUrl` → `occurrences === 1` (footer attribution
  only) — assert for `top-left` and one rotated variant (e.g. `banner`).
- `showBusinessName: false` **without** `logoUrl` → guard kicks in, `occurrences === 2`.
- `footer-logo` with 80 line items + notes + payment method → ≥ 2 pages, no render
  error (exercises the `estimateFooterHeight` bump).

## 5. Reuse map

| Existing module | Reused for |
|---|---|
| `src/lib/pdf/invoice-pdf.tsx` styles + footer machinery | All 6 templates; footer-logo pins via existing `fixed` footer |
| `POST /api/settings/preview-invoice` | Live preview (extended body only) |
| `POST /api/preferences` shallow merge | Persisting the two new keys — zero route changes |
| `parsePreferences` (`src/types/preferences.ts`) | Read path everywhere |
| `LogoUpload onChange` prop | Preview refresh + show-name force-reset on logo removal |
| `Section` / `F` helpers inside `payment-settings-form.tsx` | New "Invoice template" section styling |
| `countPages` / `extractText` / `occurrences` in existing test file | Template assertions |
| `fetchImageAsDataUri` (`src/lib/pdf/fetch-image.ts`) | Logo embedding (preview + prod) — unchanged |
| `invoiceDefaults.currency` / `dashboardCurrency` prefs | Truthful preview currency |

Deliberately **not** reused: `PortalDropdown`, `usePendingAiChanges` (no AI writes here),
`authedRoute` (binary response).

## 6. Edge cases & error handling

- **No logo uploaded:** show-name checkbox disabled + hint; renderer guard
  (`hideName` requires `logoUrl`) double-protects.
- **Logo removed while name hidden:** client force-resets the toggle to shown; renderer
  guard covers any stale stored pref.
- **Invalid/unknown `invoiceTemplate` in prefs or body:** `isInvoiceTemplateId` check →
  default `top-left`; never crash the PDF.
- **Preview fetch fails (network/500):** keep last good PDF, show inline error note in the
  panel; next edit retries automatically.
- **Rapid typing:** 800 ms debounce + `AbortController` cancels superseded requests; no
  out-of-order iframe swaps (only the latest completed fetch sets state — guard with the
  abort signal).
- **Blob URL leaks:** revoke previous URL on swap and on unmount.
- **Broken logo URL:** `fetchImageAsDataUri` try/catch → preview renders without logo
  instead of 500ing (production routes keep existing behavior — out of scope to change).
- **Multi-page footer-logo:** `estimateFooterHeight` adds the logo allowance so pinned
  logo never overlaps line items; covered by test.
- **`false` vs `undefined` for show-name:** always resolve with `?? true` (never `||`),
  so an explicit `false` survives.
- **Existing users (both keys absent):** byte-equivalent layout to today.

## 7. Testing strategy

- Colocated Vitest only, per repo convention — all in
  `src/lib/pdf/invoice-pdf.test.tsx` (§4.13). No UI/jsdom tests (repo has none).
- Optional micro-test for `invoice-templates.ts` (`isInvoiceTemplateId`, unique ids) —
  cheap, colocated `invoice-templates.test.ts`.
- Manual smoke after implement: settings load (preview appears), edit each field class,
  pick all 6 templates, toggle name, save, download a real invoice PDF, send-flow PDF.

## 8. Rollout notes

- **No DB migration / `db:push`** — JSON preference keys only.
- **No env vars**, no `NEXT_PUBLIC_*` build args, no Fly.io changes.
- Verification before merge: `pnpm lint && pnpm test && pnpm build` +
  `pnpm run build:capabilities` (sidecar changed).
- Deploy is a normal code deploy; existing invoices render identically unless a user
  explicitly picks a new template (defaults preserve current output).

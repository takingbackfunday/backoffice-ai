# SDD-05 — Business Logo on Invoices (and Quotes)

Status: Draft · Date: 2026-07-24 · PRD: `prd-05-invoice-logo.md` · Effort: M (2–3 days)

## Current-state facts (verified)

- No `logo`/`logoUrl` anywhere in `src/`. No image UploadThing UI (receipts use
  a data-URI API route, not UploadThing client).
- `src/lib/pdf/invoice-pdf.tsx` (354 lines): `@react-pdf/renderer` v4.3.2;
  imports `Document, Page, Text, View, StyleSheet, renderToBuffer` — no `Image`
  usage anywhere in the codebase. Header = left block (fromName/address/email/
  phone/website/VAT) + right block ("INVOICE" + number); `PdfInvoice` type
  defined in this file (lines 21-43).
- `src/lib/pdf/quote-pdf.tsx` (267 lines): fully separate, header styles
  copy-pasted; header is fromName text only.
- PDF routes build `PdfInvoice` inline and read sender fields via
  `parsePreferences(prefs?.data)`: `invoices/[invoiceId]/{pdf,send,remind}/route.ts`,
  `settings/preview-invoice/route.ts` (builds from request body), quote
  `{pdf,send}/route.ts`.
- UploadThing (`src/lib/uploadthing.ts`): `receiptThumbnail` is the only image
  router (`image`, 2MB, Clerk middleware) — the template for a logo router.
  `maxFileSize` must be power-of-2. Client helpers: `useUploadThing`/`uploadFiles`.
- Settings: `src/app/settings/page.tsx` → `payment-settings-form.tsx` (323 lines),
  "Business profile" section at lines 173-187; `buildPayload()` →
  `POST /api/preferences` (shallow merge, `null` deletes key); live preview via
  `POST /api/settings/preview-invoice` → PDF blob in iframe.
- react-pdf v4 `<Image>`: JPEG/PNG only (no WebP/SVG); fetches remote URLs during
  `renderToBuffer` — a CDN failure would throw the whole render; `objectFit:
  'contain'` supported; per-process URL cache (new upload = new `ufsUrl` = no
  staleness).
- `sharp` is already a dependency (used for receipt compression).

## Design

### A. Preference key

`src/types/preferences.ts` → `UserPreferenceData` gains `logoUrl?: string`.
No Prisma migration (JSON column). Write via existing `POST /api/preferences`;
remove via `{ logoUrl: null }`.

### B. UploadThing router

`src/lib/uploadthing.ts`:

```ts
logoImage: f({ image: { maxFileSize: '2MB', maxFileCount: 1 } })
  .middleware(async () => {
    const { auth: clerkAuth } = await import('@clerk/nextjs/server')
    const { userId } = await clerkAuth()
    if (!userId) throw new Error('Unauthorized')
    return { userId }
  })
  .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),
```

Client enforces PNG/JPEG via `accept="image/png,image/jpeg"` on the file input;
UploadThing's `image` type covers the rest. No server-side `sharp` normalization
in v1 (input is constrained to renderable formats); revisit if users upload
exotic formats.

### C. Settings UI — `LogoUpload` leaf

New `src/components/settings/logo-upload.tsx` (~90 lines):

- Shows current logo (thumbnail) or an empty state; "Upload logo" (file input,
  `useUploadThing('logoImage')` → on complete, POST `{ logoUrl }` immediately —
  independent of the form's Save, matching upload expectations), "Remove"
  (POST `{ logoUrl: null }`).
- Pattern copied from `vendor-detail.tsx:51,79-97` (`startUpload` → persist URL).
- `payment-settings-form.tsx`: render `<LogoUpload initialLogoUrl={...} />` at
  the top of the "Business profile" section; `settings/page.tsx` passes
  `initialLogoUrl={parsePreferences(...).logoUrl}`.
- Preview loop: `buildPayload()` includes `logoUrl` (current saved value) so
  `handlePreview` shows the logo; `preview-invoice/route.ts` body schema gains
  optional `logoUrl` and passes it into `PdfInvoice`.

### D. PDF rendering

`src/lib/pdf/invoice-pdf.tsx`:

- `PdfInvoice` gains `logoUrl?: string | null`.
- Import `Image` from `@react-pdf/renderer`; render at top of the left header
  block when present:

```tsx
{invoice.logoUrl && (
  <Image src={invoice.logoUrl} style={{ maxWidth: 140, maxHeight: 56, objectFit: 'contain', marginBottom: 8 }} />
)}
```

`src/lib/pdf/quote-pdf.tsx`: `PdfQuote` gains `logoUrl`; same slot above
`fromName`. (Header duplication between the two PDFs stays as-is — extracting a
shared `PdfHeader` is a nice-to-have, not required, and keeps this PR reviewable.)

### E. Resilient fetch — never 500 on logo failure

react-pdf fetches remote `src` during `renderToBuffer`; a CDN failure would
throw the route. Add `src/lib/pdf/fetch-image.ts`:

```ts
export async function fetchImageAsDataUri(url: string, timeoutMs = 4000): Promise<string | null>
```

- `fetch` with `AbortSignal.timeout`, verify `content-type` is `image/png` or
  `image/jpeg`, read `arrayBuffer` → base64 data URI; any failure → `null`.
- Each PDF route: `const logoDataUri = prefsData.logoUrl ? await
  fetchImageAsDataUri(prefsData.logoUrl) : null` and passes `logoUrl: logoDataUri`
  (the field now carries a data URI at render time; name stays `logoUrl` for
  simplicity). Mirrors the `Promise.allSettled` receipt-attachment pattern in
  `send/route.ts:104-115`.

Routes to update (6): invoice `pdf`, `send`, `remind`; quote `pdf`, `send`;
settings `preview-invoice`. All already read preferences — the change is
mechanical per route.

### F. Stretch (flagged, not v1)

Email body logo: `sendInvoiceEmail`/`sendReminderEmail` (`src/lib/email.ts`) can
add `<img src="${logoUrl}" style="max-height:48px">` to the header block — the
`ufsUrl` is public, so no inlining needed. Decision: implement only if PR review
confirms appetite; the attached PDF always carries the logo regardless.

## Files touched

| File | Change |
|---|---|
| `src/types/preferences.ts` | +1 key |
| `src/lib/uploadthing.ts` | +`logoImage` router |
| `src/components/settings/logo-upload.tsx` | new leaf |
| `src/components/settings/payment-settings-form.tsx` | +render leaf, +payload key |
| `src/app/settings/page.tsx` | pass `initialLogoUrl` |
| `src/lib/pdf/invoice-pdf.tsx`, `quote-pdf.tsx` | type + `Image` render |
| `src/lib/pdf/fetch-image.ts` | new helper + unit test |
| 6 routes listed in §E | prefetch + pass-through |

All well under the 400-line cap.

## Edge cases

- **Failure modes:** CDN timeout/5xx → `null` → logo-less PDF, route succeeds.
  Non-PNG/JPEG bytes at the URL → `null` (content-type check). Oversized image →
  UploadThing rejects at upload.
- **SVG/WebP upload attempts:** blocked by `accept` + UploadThing `image` type;
  if one slips through, react-pdf never sees it (content-type guard).
- **Logo replaced:** new `ufsUrl` → react-pdf cache miss → fresh logo next PDF.
  Old UploadThing file orphaned (same lifecycle as other uploads — acceptable).
- **User deletes preference row / new user:** `logoUrl` undefined → identical
  PDFs to today.
- **Preview route body:** `logoUrl` optional; absent → no logo in preview.
- **Email clients** (stretch only): many block remote images — logo shows as
  blocked-image placeholder; PDF attachment unaffected.

## Testing plan

- Unit: `fetch-image.ts` — timeout, non-image content-type, success path (mock
  `fetch`).
- Build check: `pnpm build` (react-pdf `Image` import server-side).
- Manual QA:
  1. Settings → upload PNG logo → thumbnail appears → Preview invoice shows logo.
  2. Download invoice PDF (logo), send invoice email (attachment has logo),
     reminder (has logo).
  3. Quote PDF + quote send → logo.
  4. Remove logo → next PDF clean.
  5. Upload 3MB file → rejected with UploadThing error; upload `.webp` → blocked.
  6. (Simulate) blob URL unreachable → PDF still generates without logo.

## Rollout

One PR. No migrations, no flags, no deploy ordering constraints (UploadThing
router ships with the app; preference key is inert until set).

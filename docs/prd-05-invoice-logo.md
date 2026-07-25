# PRD-05 — Business Logo on Invoices (and Quotes)

Status: Draft · Owner: Staff Eng · Date: 2026-07-24 · Priority: P2 · SDD: `sdd-05-invoice-logo.md`

## Problem

Invoices go out with the business name and address as plain text. Users want
their brand logo on the invoice PDF — table stakes for a professional invoice.
There is no image upload anywhere in the app today (all UploadThing routers are
PDF-only), and the PDF templates render no images.

## Goals

- User uploads one logo in Settings → Business profile; it renders on every
  invoice PDF (download, send, reminder) automatically.
- Same treatment for quote PDFs (same client-facing branding surface).
- The existing "preview invoice" loop in Settings shows the logo live.

## Non-goals

- Per-workspace/per-client logo overrides (one logo per user, matching the
  existing business-profile preferences model).
- Logo in the lease-contract PDF (internal legal doc, not client branding).
- Logo inside the email HTML body (the PDF is attached; email-body logo is a
  cheap stretch goal — see SDD — but not required for v1).
- Logo positioning/size customization (fixed header slot, sensible max size).
- SVG support (react-pdf `<Image>` doesn't take SVG; PNG/JPEG only).

## User stories

- As a freelancer, I upload my logo once and every invoice I download or email
  shows it at the top.
- As a user, I can replace or remove my logo at any time; removal takes effect on
  the next PDF generated.
- As a user, the Settings invoice preview reflects my logo before I send anything.

## Requirements

### R1 — Logo upload & storage

- Settings → Business profile gains a logo field: upload button, thumbnail
  preview, Replace / Remove actions.
- Storage via a new UploadThing router (image, 2MB, Clerk-authed); the resulting
  URL persists in `UserPreference.data.logoUrl` (JSON column — **no migration**).
- Accepted formats: PNG or JPEG (react-pdf constraint). Server-side normalization
  (reject/convert others) per SDD.
- Remove = POST `{ logoUrl: null }` (preferences route already null-deletes keys).

### R2 — PDF rendering

- Invoice PDF header: logo above the business name, max ~140×56px, aspect
  preserved. When no logo is set, layout is exactly as today.
- Quote PDF header: same slot.
- PDF generation must be resilient: if the logo fetch fails (CDN hiccup), the
  PDF renders **without** the logo rather than erroring the route.

### R3 — Data flow everywhere PDFs are made

- All routes that build a `PdfInvoice` pass `logoUrl` through: pdf download,
  send, remind, and the Settings preview-invoice route (the preview request body
  gains `logoUrl` so the live preview matches).
- Quote pdf/send routes: same.

### R4 — Settings UX

- The logo field lives in the existing "Business profile" section alongside
  business name/address (page copy already promises these details "appear on
  every invoice you send").
- `payment-settings-form.tsx` is at 323 lines — the logo UI lands in an extracted
  `LogoUpload` leaf component to respect the 400-line cap.

## Success metrics

- Upload logo → download any invoice PDF → logo visible top-left.
- Remove logo → next PDF has no logo; no stale cache (new upload → new URL).
- Kill network to UploadThing CDN (simulated) → PDF still generates, sans logo.

## Alternatives considered

- **Store logo in a `Workspace`/profile table.** Rejected: business identity
  already lives in `UserPreference.data` (name, address, VAT…); one logo per user
  matches that model with zero migration.
- **Inline base64 in preferences.** Rejected: bloats a hot JSON row; UploadThing
  URLs are the established pattern (receipts, vendor docs).
- **Logo per invoice.** Rejected: brand consistency is the point; per-invoice
  overrides add editor complexity for a niche need.

## Open questions

- Max file size 2MB vs 4MB — 2MB matches `receiptThumbnail` and is generous for
  a logo; confirm.
- Dark-logo-on-white-header: no theming support planned; acceptable.

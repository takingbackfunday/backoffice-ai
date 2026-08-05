# PRD — Invoice templates + always-on live preview on the Settings page

## 1. Problem statement

The Settings page collects everything that appears on an invoice (business profile, logo,
payment methods, notes defaults), but the user gets no continuous feedback on what their
invoice actually looks like. The only feedback today is a manual "Preview invoice" button
that opens a modal — one click, one render, easily forgotten, and invisible while editing.

Additionally, the invoice PDF has exactly one hardcoded header layout (logo top-left,
business name beneath it). Users who want their logo presented differently — or who want to
drop the redundant text business name when the logo already carries their brand — have no
options.

## 2. Goals & non-goals

### Goals

- G1: An always-visible sample invoice rendered to the **right of the settings form** on
  desktop, using the **real PDF generator** (guaranteed fidelity with what clients receive).
- G2: The preview **updates automatically** as the user edits any invoice-visible field —
  no button click, no modal (debounced regeneration).
- G3: The user can pick one of **6 invoice templates**; templates differ **only in
  arrangement** (logo placement / header layout), sharing the same fonts, sizes and neutral
  palette.
- G4: A **"show business name"** toggle lets the user hide the text business name in the
  invoice header (for when the logo alone is sufficient branding).
- G5: The chosen template + toggle apply to **all** invoice PDFs the app produces
  (download, send, remind, applicant send-invoice) — not just the settings preview.
- G6: Zero disruption for existing users: defaults reproduce today's layout exactly.

### Non-goals

- Quote PDF templates (invoice only for now).
- Color/font/theme customization — arrangement only.
- Watermark logo variant (deferred; template F is footer placement only).
- The HTML invoice detail view keeps its current rendering.
- Per-invoice template overrides — the template is one global preference.

## 3. User stories

- US1: As a freelancer editing my business profile, I want to see my invoice update beside
  me as I type, so I know exactly what clients will receive without clicking anything.
- US2: As a user with a strong logo, I want to choose where my logo sits on the invoice
  (top-left, centered, top-right, banner, inline, or footer) so the layout matches my brand.
- US3: As a user whose logo contains my business name, I want to hide the text business
  name on the invoice so the header isn't redundant.
- US4: As an existing user, I want my invoices to look exactly as they did before this
  feature unless I explicitly pick a different template.

## 4. Functional requirements

**FR1 — Persistent preview panel.** The settings page shows a sticky preview panel to the
right of the form on desktop (`lg` breakpoint and up); on smaller screens it stacks below
the form. The panel renders the PDF produced by the existing
`POST /api/settings/preview-invoice` route in an iframe.

**FR2 — Automatic refresh.** The preview regenerates on any change to an invoice-visible
form field (business name, your name, address, email, phone, website, VAT number, logo,
bank transfer fields, PayPal/Stripe/custom methods, notes default, payment instructions,
template, show-business-name), debounced ~800 ms after the last change. In-flight stale
requests are aborted. The previous PDF stays visible while the new one renders; a subtle
"Updating…" indicator shows during regeneration. A failed regeneration keeps the last good
PDF and surfaces a small error note.

**FR3 — Initial render.** The preview renders once on page load from the saved
preferences, without any user interaction.

**FR4 — Six templates.** The user picks one template (radio cards with miniature wireframe
thumbnails) in a new "Invoice template" section of the form:

| ID | Name | Header arrangement |
|---|---|---|
| `top-left` | Classic | Logo above business name/details (left); INVOICE + number right — **current layout, default** |
| `top-center` | Centered | Logo, name and details centered; INVOICE + number centered beneath |
| `top-right` | Right-aligned | Logo above name/details (right-aligned); INVOICE + number left |
| `banner` | Banner | Full-width neutral band (`#f5f5f5`) containing logo left + name/details; INVOICE row below the band |
| `inline` | Compact | Single row: logo left, name + details beside it; INVOICE + number right |
| `footer-logo` | Footer logo | Header is text-only (name + details left, INVOICE right); logo pinned in the footer area on every page |

All templates share fonts, sizes and the existing neutral palette; they differ only in
arrangement.

**FR5 — Show business name toggle.** A checkbox "Show business name on invoice" (default:
checked) controls whether the text business name renders in the invoice header, in every
template. The checkbox is **disabled with an explanatory hint when no logo is uploaded**
(hiding the name with no logo would leave the invoice without sender identity). The tiny
footer attribution line (`invoiceNumber · fromName`) is unchanged (see Open questions).

**FR6 — Persistence.** Template and toggle are stored in `UserPreference.data` as
`invoiceTemplate` (string id) and `invoiceShowBusinessName` (boolean) via the existing
`POST /api/preferences` shallow-merge route, saved together with the rest of the form on
"Save settings". Absent values default to `top-left` and `true`.

**FR7 — Applied everywhere.** All five `generateInvoicePdf` call sites honor the template
and toggle: settings preview, invoice download PDF, send, remind, applicant send-invoice.

**FR8 — Preview reflects notes default.** The preview route accepts `invoiceNotesDefault`
and uses it as the sample invoice's notes (falling back to the hardcoded sample text when
empty/absent), so editing that field also updates the preview.

**FR9 — Modal removed.** The "Preview invoice" button and its modal are removed from the
form; the persistent panel replaces them.

**FR10 — Sample data otherwise unchanged.** Sample client, line items, dates and invoice
number logic stay as-is. Preview currency becomes
`invoiceDefaults.currency ?? dashboardCurrency ?? 'USD'`.

## 5. UX & design considerations

- Settings page becomes a two-column layout: form column (left, ~`max-w-xl`) + sticky
  preview panel (right, A4-proportioned, ~75–80vh, `position: sticky; top: 24px`).
  `AiFeaturesForm` stays in the left column below the form.
- Template picker: 6 radio cards, each with a tiny CSS/div wireframe thumbnail of the
  layout + label. Selected card gets a primary ring. The "Show business name" checkbox
  lives directly beneath the picker, inside the same section (anchor `#invoice-template`
  for deep-linking).
- Preview panel header: "Invoice preview" + small spinner/"Updating…" text during
  regeneration; no flash of blank content between renders.
- The panel is informational only — no interactions besides scrolling the iframe.
- Logo replace/remove via the existing `LogoUpload` immediately triggers a preview
  regeneration through the same debounced path.

## 6. Acceptance criteria & success metrics

- AC1: Load `/settings` → a sample invoice is visible on the right without clicking anything.
- AC2: Type in the business name field → within ~1.5 s of stopping, the preview shows the
  new name. Same for address/email/phone/website/VAT, notes default, payment instructions,
  payment-method fields, logo upload/remove.
- AC3: Select each of the 6 templates → preview shows the logo/name arranged per FR4;
  downloaded PDF of a real invoice matches the selected template.
- AC4: Uncheck "Show business name" (with logo present) → header no longer shows the text
  name in any template; Save → real invoice PDFs also omit it.
- AC5: Remove the logo → the show-name checkbox becomes disabled (and effectively true in
  the rendered output, since no logo exists).
- AC6: An existing user with no new prefs sees byte-equivalent layout to today (template
  `top-left`, name shown).
- AC7: Narrow viewport (< lg) → panel stacks below the form; no horizontal overflow.
- Success metric: qualitative — template choice and live feedback verified in prod smoke
  test; no support complaints about changed invoices from existing users.

## 7. Out of scope

- Quote PDF templates; estimate/lease PDFs.
- Colors, fonts, accent styling, watermark logos.
- HTML invoice detail view restyling.
- Per-client or per-invoice template overrides.
- Mobile-specific preview optimizations beyond stacking.

## 8. Open questions & risks

- OQ1: When "show business name" is off, the footer attribution line
  (`invoiceNumber · fromName`) still includes the name — it doubles as document
  attribution. Keep, or hide there too? (Plan: keep.)
- OQ2: Template F spec'd as **footer placement only** (not watermark) — confirm.
- OQ3: Banner uses the existing neutral `#f5f5f5` gray — no brand color introduction.
- Risk: `generateInvoicePdf` runs up to 6 internal render passes; debounced regeneration
  is acceptable but the panel must never block typing (all async, stale-safe).
- Risk: logo image is re-fetched server-side on every preview render; acceptable at this
  cadence (UploadThing CDN), cache later if needed.

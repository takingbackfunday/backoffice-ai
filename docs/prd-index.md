# PRD Index — Transactions / Rules / Upload / Currency / Branding batch

Status: Draft · Owner: Staff Eng · Date: 2026-07-24

This batch organizes 13 reported bugs/feature requests into 5 PRDs, each with a
companion SDD. Items are numbered as reported by the user.

## Item → PRD mapping

| # | Reported item | Type | PRD |
|---|---|---|---|
| 1 | Clicking into a transaction: must click on/off category to show dropdown | Bug | PRD-01 |
| 2 | Warn user of contradictory rules | Feature | PRD-02 |
| 3 | Make-rule from a changed transaction only picks up category, not payee | Bug | PRD-01 |
| 4 | New payee disappears when clicking Done | Bug | PRD-01 |
| 5 | Rule editor category dropdown needs type-search (like transactions page) | Feature | PRD-02 |
| 6 | Rule editor: creating a payee must be an explicit action, not passive | Feature | PRD-02 |
| 7 | Single-transaction view: full description is cut off | Bug/UX | PRD-01 |
| 8 | Pivot table should use dashboard currency; currency picker always next to user icon | Feature | PRD-04 |
| 9 | AI suggested rules off by default; user opt-in | Feature | PRD-02 |
| 10 | Add user's logo to invoices | Feature | PRD-05 |
| 11 | Upload: detect previous uploads and reuse last mapping/settings | Feature | PRD-03 |
| 12 | Allow multiple CSV/PDF uploads if identical format / same bank | Feature | PRD-03 |
| 13 | Amount filter broken: only min works; can't clear without refresh | Bug | PRD-01 |

## Documents

| Doc | Title | Priority | Effort |
|---|---|---|---|
| `prd-01-transaction-row-editing.md` / `sdd-01-transaction-row-editing.md` | Transaction row editing & filtering fixes | P0 (bugs, live UX pain) | M (3–5 d) |
| `prd-02-rules-ux-safety.md` / `sdd-02-rules-ux-safety.md` | Rules UX, explicit payee creation, AI opt-in, conflict warnings | P0/P1 | L (5–8 d) |
| `prd-03-import-profiles-multifile.md` / `sdd-03-import-profiles-multifile.md` | Saved import profiles + multi-file upload | P2 | L (6–9 d) |
| `prd-04-global-currency.md` / `sdd-04-global-currency.md` | Global currency selector + pivot currency support | P1 | M (3–4 d) |
| `prd-05-invoice-logo.md` / `sdd-05-invoice-logo.md` | Business logo on invoices (and quotes) | P2 | M (2–3 d) |

## Recommended sequencing

1. **PRD-01 first** — all five items have confirmed root causes; fixes are small,
   high-visibility, and unblock daily transaction triage. Ships independently.
2. **PRD-02 next** — items 6 and 9 are small; item 5 reuses the combobox primitive
   hardened in PRD-01; item 2 (conflict detection) is the largest piece and can
   land behind items 5/6/9.
3. **PRD-04** — independent, no schema changes, unblocks pivot for multi-currency users.
4. **PRD-05** — independent, no schema changes (preference key + UploadThing router).
5. **PRD-03 last** — largest surface (schema migration + store reshape + two API
   routes); highest long-term retention value for bank-import users.

## Cross-cutting architectural themes

These PRDs share root causes; the SDDs fix them once, in one place:

1. **PortalDropdown invariant.** Three separate bugs (items 1-partial, 4-partial, 13)
   come from `useOutsideClick` call sites missing `ignoreSelector: '[data-portal-dropdown]'`
   (`payee-cell.tsx`, `column-filter-popover.tsx`, `date-filter-header.tsx`). Fix:
   a `usePortalOutsideClick` wrapper with the guard baked in, plus a shared
   `Combobox` primitive so future dropdowns can't get it wrong. (SDD-01, SDD-02)
2. **Explicit entity creation.** Payees are created implicitly in two places
   (transaction cell silently discards unmatched drafts; rules API silently upserts
   any `payeeName` string). Both move to an explicit "+ Create" action backed by
   `POST /api/payees` with a friendly 409. (SDD-01, SDD-02)
3. **Preference-driven gating.** `UserPreference.data` is the established
   no-migration persistence mechanism; used for AI opt-in (PRD-02), currency
   (PRD-04), and logo (PRD-05). PRD-03 is the exception — it needs a real model.
4. **Duplicated primitives.** Two app headers render `UserButton` (PRD-04);
   invoice/quote PDFs duplicate header markup (PRD-05); currency symbol maps are
   scattered across widgets (PRD-04). Each is consolidated as part of its PRD.

## Notes

- Component-size cap (400 lines) is a binding constraint: `rule-editor.tsx` (720),
  `rules-manager.tsx` (737) already violate it, and `transaction-table.tsx` (375) /
  `transaction-row.tsx` (357) are near it. Every SDD budgets extraction rather than
  piling into these files.
- No BigQuery anywhere; Neon/Prisma only. New models require `pnpm db:push` before
  deploy (see CLAUDE.md schema-drift gotcha).

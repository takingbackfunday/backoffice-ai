# PRD — Client Hub notice/KPI filter fix

Slug: `client-hub-notice-filter-fix`
Date: 2026-08-03
Status: Draft (awaiting approval)

---

## 1. Problem statement

On the Client Hub (`/studio`), clicking a **Take notice** item or a KPI card correctly narrows the client-card list to the matching client(s) and expands them — but the expanded card body shows **"No details available"** instead of the relevant invoices/quotes.

Root causes (confirmed in code):

1. **Missing lazy-load trigger on programmatic expansion.** Card detail data (invoices, quotes, jobs) is fetched on demand via `GET /api/studio/clients/[clientProfileId]`, but the fetch (`fetchCardDetail`) is only wired to a *manual* click on the card header (`onExpand`). When a notice/KPI click sets `clientFilter` + `expandedClient`, all matching cards render expanded with `detail === undefined` and fall through to the "No details available" empty state. Affects: draft-invoice notice, overdue notice, and the Outstanding / Overdue / Collected KPI cards.
2. **Quote notices filter against always-empty arrays.** `ClientCardsSection` filters `awaiting-quotes` / `uninvoiced-quotes` using `client.sentQuotes` / `client.acceptedQuotes`, but `src/app/studio/page.tsx` hardcodes both to `[]` (quote data only exists in the separate `flatQuotes` prop, which `ClientCardsSection` never receives). Clicking either quote notice therefore removes **every** client card from the list.
3. **Predicate drift.** The client-matching logic is duplicated across the notice handlers, the KPI click handler, and the card-list filter — and they already disagree (e.g. the Collected KPI expands the first client with a payment in the past 30 days, but the list filter shows clients with *any* paid invoice ever).

## 2. Goals & non-goals

**Goals**

- Every clickable notice and KPI card produces a correctly filtered list whose expanded cards display the relevant invoices/quotes after a brief loading state.
- All matching cards expand and lazy-load their details in parallel (existing documented behavior — confirmed with user).
- Quote notices filter the card list from the same `flatQuotes` data source used to compute the notice counts.
- One shared, pure, unit-tested predicate (`clientMatchesFilter`) powers the notice handlers, the KPI handler, and the card-list filter so they can never drift apart again.

**Non-goals**

- No changes to `GET /api/studio/clients/[clientProfileId]`, `fetchClientDetail`, or any SQL.
- No visual redesign of the expanded card, notices, or KPI bar.
- No server payload changes to populate `client.invoices` / `client.sentQuotes` / `client.acceptedQuotes` (the fix reads from `flatInvoices` / `flatQuotes` instead).
- No changes to the Portfolio (`/portfolio`) page.

## 3. User stories

- As a freelancer, when I click **"Invoice — N drafts unsent"**, I see every client with a draft invoice expanded, each showing their draft invoice rows, so I can click through and send them.
- As a freelancer, when I click **"Invoice — N overdue"** or the **Overdue** KPI, I see matching clients expanded showing their overdue invoices.
- As a freelancer, when I click the **Invoices Outstanding** or **Collected Past 30 Days** KPI, I see matching clients expanded showing their outstanding / recently-paid invoices.
- As a freelancer, when I click **"Quote — N awaiting acceptance"**, I see exactly the clients with sent quotes, expanded showing those quotes (today the list goes completely empty).
- As a freelancer, when I click **"Quote — N accepted, not yet invoiced"**, I see exactly the clients with uninvoiced accepted quotes, expanded showing those quotes.
- As a freelancer, when I toggle a filter off (re-click the notice/KPI or the ✕ chip), the list returns to normal with cards collapsed.

## 4. Functional requirements

| # | Requirement |
|---|---|
| FR-1 | Clicking the draft-invoice notice sets the `unsent` filter, expands **all** clients having ≥1 DRAFT invoice (per `flatInvoices`), triggers a detail fetch for each, and each expanded card displays only its DRAFT invoices. |
| FR-2 | Clicking the overdue notice behaves identically for invoices whose display status is OVERDUE. |
| FR-3 | Clicking the "awaiting acceptance" quote notice filters clients via `flatQuotes` (`status === 'SENT'`, matched on `clientProfileId`), expands all matches, fetches details, and shows sent quotes in the expanded body. |
| FR-4 | Clicking the "accepted, not yet invoiced" quote notice filters via `flatQuotes` (`status === 'ACCEPTED' && !hasInvoice`), expands, fetches, and shows those accepted quotes. |
| FR-5 | The Outstanding / Overdue / Collected KPI cards trigger the same expand-all + fetch-all behavior as the notices. |
| FR-6 | The Collected filter uses one consistent definition everywhere (KPI find-first, card list, expanded body): display status PAID **and** `issueDate` within the past 30 days — matching what the KPI card advertises. (Deliberate reconciliation of existing drift; see Risks.) |
| FR-7 | While a detail fetch is in flight, each expanded card independently shows the existing spinner; on fetch failure the card keeps the existing silent-fail "No details available" state. No new error UI. |
| FR-8 | Toggling the active filter off (re-click or ✕ chip) clears `clientFilter`, collapses all cards, and issues no further fetches. |
| FR-9 | Client matching for every filter type is evaluated by a single exported pure function `clientMatchesFilter(client, filter, flatInvoices, flatQuotes)` in `studio-shared.ts`, used by the notice handlers, the KPI handler, and the card-list filter. |
| FR-10 | Manual expand/collapse of a card (header click) behaves exactly as today, including triggering the detail fetch on first expand. |
| FR-11 | Duplicate/redundant fetches are prevented by the existing `cardDetails`/`cardLoading` guards in `fetchCardDetail`. |

## 5. UX & design considerations

- **Expand-all preserved:** with a filter active, every matching card expands (per `isExpanded = expandedClient === client.id || !!clientFilter`) and each fires its own detail fetch in parallel. No serialization, no artificial cap.
- **No new visuals:** reuse the existing per-card spinner (`Loading details…`) and empty state. Filtered card headers still collapse to name + chevron; section labels stay hidden in filter mode.
- **Perceived latency:** details arrive in one round trip per visible card; the endpoint is lightweight (no line items). Acceptable even with many matches.
- **Filter chip** in the "Client accounts" header remains the escape hatch, alongside re-clicking the active notice/KPI.

## 6. Acceptance criteria & success metrics

**Repro / verification scenario (the reported bug):** from a fresh `/studio` load, with a client that has a DRAFT invoice and **without** having manually expanded any card, click "Invoice — 1 draft unsent" → the matching client card expands, shows a spinner, then displays the draft invoice row. Clicking the row navigates to the invoice detail page.

**Full matrix:** the above holds for all six filters — `unsent`, `overdue`, `outstanding`, `collected`, `awaiting-quotes`, `uninvoiced-quotes` — including the multi-client case (all matches expand and populate).

**Regression checks:**

- Manual card expand still lazy-loads and renders.
- Toggling a filter off restores the unfiltered, collapsed list.
- Quote notices no longer empty the list.
- With a filter active, client search still narrows within the filtered set.

**Success metrics:** zero "No details available" impressions caused by programmatic expansion; notice → invoice-detail click-through works on first click. Verified manually + `pnpm lint && pnpm test && pnpm build` green.

## 7. Out of scope

- **Client search by invoice/quote number** — the omni-search box reads the same always-empty `client.invoices`/`sentQuotes`/`acceptedQuotes` arrays, so it only ever matches client name/company/contact. Related, but a separate pre-existing gap; candidate fast-follow (the data is available in `flatInvoices`/`flatQuotes` after this fix).
- Server-side population of the empty arrays on the `Client` payload.
- Any API route, SQL, Prisma schema, or migration work.
- Portfolio page parity review.

## 8. Open questions & risks

- **FR-6 behavior change (Collected window).** Narrowing the list/body to "paid within past 30 days" aligns the filter with the KPI card's label but changes what long-time users may see after clicking it (previously any client with any paid invoice). Flagged for explicit approval.
- **N parallel fetches** when many clients match — bounded by the number of visible cards; endpoint is cheap. No mitigation planned.
- **Silent fetch failures** remain silent (existing pattern). Acceptable; a failed card just shows the empty state and retries on next manual expand (the `cardLoading` guard resets, though `cardDetails` stays unset — retry works because neither guard is stuck).

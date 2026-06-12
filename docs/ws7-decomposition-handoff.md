# WS7 (P2): Decompose the Mega-Components — Execution Handoff

**For**: the engineer executing Workstream 7 from `temp-prd.md`.
**Status of prior workstreams**: WS1–WS6 are landed (money module, tests, overdue sweep, `authedRoute`/`authz`, AI usage caps, SQL dashboard KPIs). You can rely on all of them.

---

## 0. Read this first — the rules of this workstream

This is a **pure refactor**. The single most important rule:

> **Behavior and pixels must be identical before and after. No redesign. No bug fixes inside the refactor.**

If you spot a bug while refactoring, **do not fix it here**. Write it down at the bottom of this doc under "Bugs found (do not fix in WS7)" and keep going.

### The gate (run before starting AND after finishing every step)
```bash
pnpm lint && pnpm test && pnpm build
```
All three must pass. `react-hooks/rules-of-hooks` in the linter will catch most extraction mistakes — trust it.

### Hooks gotcha (from CLAUDE.md)
`useState`/`useReducer`/`useEffect`/`useCallback`/`useRef` must stay at the **top level** of a component or custom hook function. When you move state into a custom hook, the hook itself must follow the `use*` naming convention or the linter rule will not apply correctly.

### What "done" means for the whole workstream
- `transaction-table.tsx` is **under 400 lines** and composes extracted hooks + leaf components.
- Exactly **one** implementation of the portal-dropdown + outside-click contract exists.
  - `rg -n "data-portal-dropdown" src` must show only the shared component/hook (plus JSX that consumes the shared component — no hand-rolled `addEventListener('mousedown', ...)` outside-click handlers left in `transaction-table.tsx`).
- A 400-line component cap rule is added to `CLAUDE.md`.
- `pnpm lint && pnpm test && pnpm build` green.

### Order of attack (do NOT reorder)
1. **Step 1** — Shared abstractions (`PortalDropdown` + `useOutsideClick`). Everything else depends on this.
2. **Step 2** — `transaction-table.tsx` (2,292 lines, highest churn).
3. **Step 3** — `invoice-editor.tsx` (1,105 lines).
4. **Step 4** — `studio-client.tsx` (1,424 lines).
5. **Step 5** — `work-order-panel.tsx` (673 lines).
6. **Step 6** — Add the standing rule to `CLAUDE.md`.

`portfolio-client.tsx`, `quote-generator.tsx`, and `applicant-detail.tsx` are **out of scope for WS7** — `applicant-detail.tsx` is decomposed later as part of WS9. Leave them alone.

**Commit one step per change set.** Do not push (CLAUDE.md git rule — commit only, never `git push` unless asked).

---

## Step 1 — Build the two shared abstractions

These replace the fragile, hand-rolled DOM convention used across the app today
(`useAnchorRect` + manual `mousedown` capture listeners + the `[data-portal-dropdown]` string contract).

### 1a. `src/hooks/use-outside-click.ts`
A reusable hook that fires a callback when the user clicks outside a referenced element, with an opt-out selector for portal content.

```ts
import { useEffect } from 'react'

export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  opts?: { enabled?: boolean; ignoreSelector?: string },
) {
  const enabled = opts?.enabled ?? true
  useEffect(() => {
    if (!enabled) return
    function handler(e: MouseEvent) {
      const target = e.target as Element | null
      if (opts?.ignoreSelector && target?.closest(opts.ignoreSelector)) return
      if (ref.current && target && !ref.current.contains(target)) onOutside()
    }
    // capture phase: matches the existing behaviour in transaction-table.tsx
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [ref, onOutside, enabled, opts?.ignoreSelector])
}
```

### 1b. `src/components/ui/portal-dropdown.tsx`
A dropdown that **always** renders into `document.body` via `createPortal`, **always** stamps `data-portal-dropdown`, and positions itself with `position: fixed` from an anchor's `getBoundingClientRect`. This absorbs the existing `useAnchorRect` helper (currently a private function at the top of `transaction-table.tsx`, lines ~38–56).

Requirements:
- Props: `anchorRef: React.RefObject<HTMLElement | null>`, `open: boolean`, `onClose: () => void`, `children`, optional `align?: 'left' | 'right'` and `widthFromAnchor?: boolean`.
- Internally tracks the anchor rect (port the `useAnchorRect` logic: read `getBoundingClientRect`, update on `scroll`/`resize`, recompute when `open` flips).
- Renders `null` when `!open` or `typeof window === 'undefined'`.
- Root element gets `data-portal-dropdown` and `position: fixed` with computed `top`/`left`/`width`.
- Use `useOutsideClick` internally (with `ignoreSelector` pointing at the anchor) **OR** leave outside-click to the consumer — pick one and be consistent. Recommendation: leave outside-click to the consumer so the dropdown stays presentational.

**Why this matters (from CLAUDE.md "Transaction table — dropdowns must use portals"):** the table wrapper has `overflow-auto` which clips absolutely-positioned dropdowns; portals into `document.body` with `position: fixed` are mandatory. The `data-portal-dropdown` marker is what stops the row outside-click handler from exiting row-edit when a user clicks a dropdown item.

### Step 1 acceptance
- Both files exist and `pnpm build` passes.
- No consumer yet — that's fine. Commit as "WS7: add shared PortalDropdown + useOutsideClick".

---

## Step 2 — Decompose `transaction-table.tsx`

Current file: 2,292 lines, 54 hook call sites, 4 private cell components, 4 private header/popover components, one giant `TransactionTable` component (starts line 826).

### 2a. Map of what's in the file today (for orientation)
| Lines | Symbol | Becomes |
|---|---|---|
| 38–56 | `useAnchorRect` | **delete** — absorbed by `PortalDropdown` (Step 1) |
| 58–95 | `TextCell` | move to `cells/text-cell.tsx` |
| 97–134 | `WorkspaceCell` | move to `cells/workspace-cell.tsx` |
| 143–305 | `CategoryCell` (portal dropdown) | move to `cells/category-cell.tsx`, use `PortalDropdown` |
| 317–450 | `PayeeCell` (portal dropdown) | move to `cells/payee-cell.tsx`, use `PortalDropdown` |
| 451–465 | `FunnelIcon` | move to `cells/funnel-icon.tsx` (or a shared `icons.tsx`) |
| 466–614 | `ColumnFilterPopover` (portal) | move to `headers/column-filter-popover.tsx`, use `PortalDropdown` |
| 615–688 | `FilterableSortHeader` | move to `headers/filterable-sort-header.tsx` |
| 689–825 | `DateFilterHeader` (portal) | move to `headers/date-filter-header.tsx`, use `PortalDropdown` |
| 826–2292 | `TransactionTable` | the orchestrator — extract hooks + leaf rows |

### 2b. Create this folder layout
```
src/components/transactions/
  transaction-table.tsx          (orchestrator, target < 400 lines)
  hooks/
    use-transaction-data.ts      (fetch / pagination / filters / sort / search)
    use-inline-edit.ts           (row edit state, commitEdit, exitRowEdit, make-rule snap ref)
    use-bulk-select.ts           (selectMode, selectedIds, bulk delete)
    use-nl-search.ts             (aiMode, aiQuery, aiLoading, aiExplanation)
  cells/
    text-cell.tsx
    workspace-cell.tsx
    category-cell.tsx
    payee-cell.tsx
    funnel-icon.tsx
  headers/
    column-filter-popover.tsx
    filterable-sort-header.tsx
    date-filter-header.tsx
  rows/
    transaction-row.tsx          (the per-row <tr> render, lines ~2096+)
    new-row.tsx                  (the "add row" inline form)
  toolbar/
    bulk-delete-bar.tsx
    nl-search-bar.tsx
```

### 2c. Extraction order (do these one at a time, build between each)

1. **Move the leaf cells/headers first** (mechanical, lowest risk). For each: cut the function into its new file, export it, add imports, replace `useAnchorRect` + manual portal JSX with `<PortalDropdown>`. Build. The `CategoryCell`/`PayeeCell`/`ColumnFilterPopover`/`DateFilterHeader` each currently have their own `useAnchorRect` call and a manual `mousedown` listener — these go away, replaced by `PortalDropdown` + (if needed) `useOutsideClick`.

2. **Extract `use-transaction-data.ts`**: owns `localRows`, `total`, `page`, `loading`, `error`, `refreshKey`, `sortBy`, `sortDir`, `search`/`debouncedSearch`, `filters`/`debouncedFilters`, `openFilterCol`, the date-filter state (`dateFrom/dateTo/customFrom/customTo` + `applyPreset`/`applyCustomDates`/`clearDateFilter`), and `fetchTransactions` (lines ~1024–1066) with its `AbortController`. Returns `{ rows, total, page, setPage, loading, error, sort, filters, ... , refetch }`. The orchestrator calls `useTransactionData(initialRows, initialTotal, ...)`.

3. **Extract `use-inline-edit.ts`**: owns `editingRowId`, `editingRowInitialField`, `savingIds`, `errorIds`, `deletingIds`, the `editingRowIdRef`, the edit-queue refs (`editQueueRef`, `suggestionTimerRef`), the make-rule state (`makeRuleSnap`, `showMakeRuleEditor`, `lastEditedRowId`, `pendingRuleSnapRef`), `fireSuggestions`, `promoteIfLeft`, `commitEdit`, `exitRowEdit`, and the outside-click effect (lines ~964–981). **Replace that effect with `useOutsideClick`** using `ignoreSelector: '[data-portal-dropdown]'`.
   - **CRITICAL (from CLAUDE.md "Make-rule snap"):** `pendingRuleSnapRef.current` merges each new `commitEdit` (category or payee) with the previous snap for the same row using `resolvedValue ?? prevSnap?.value`. Preserve this exactly — do not simplify it.

4. **Extract `use-bulk-select.ts`**: `selectedIds`, `selectMode`, `bulkDeleting`, `bulkDeletedCount`, toggle/select-all, and the bulk delete handler.

5. **Extract `use-nl-search.ts`**: `aiMode`, `aiQuery`, `aiLoading`, `aiExplanation` and the search submit handler (calls `POST /api/agent/search-transactions`).

6. **Extract leaf render pieces**: `TransactionRow` (the `<tr>` block ~2096+), `NewRow` (the add-row form), `BulkDeleteBar`, `NlSearchBar`. These take explicit props from the hooks — no shared closure.

7. The orchestrator `transaction-table.tsx` now: calls the four hooks, holds the static lookup lists (`projects`/`categoryGroups`/`payees`/`accounts` load effects — these can stay or move into `use-transaction-data`), wires the toolbar modals (`showNewRuleModal`, `showAgentModal` for `RuleEditor`/`RulesAgent`), and renders `<table>` composing the extracted pieces.

### 2d. Watch-outs specific to this file (all from CLAUDE.md)
- **Field name split**: the `GET /api/transactions` query param is `projectId` (client-facing). The `PATCH /api/transactions/[id]` body must use `workspaceId`. The UI field in `commitEdit` is `projectId` and is mapped to `workspaceId` before sending. **Keep this mapping intact when moving `commitEdit`.**
- **Portal dropdowns**: every dropdown inside the `overflow-auto` table wrapper must render via the portal. After refactor, `CategoryCell`/`PayeeCell`/filter popovers all go through `PortalDropdown`.
- **`data-portal-dropdown` marker**: the inline-edit outside-click handler must still skip clicks inside `[data-portal-dropdown]`. `PortalDropdown` stamps this automatically; the `useOutsideClick` in `use-inline-edit.ts` must pass `ignoreSelector: '[data-portal-dropdown]'`.

### Step 2 acceptance
- `transaction-table.tsx` < 400 lines.
- Manually exercise and confirm identical behaviour: inline edit a category + the make-rule popup appears on leaving the row; inline edit a payee; bulk select + delete; NL ("AI mode") search; open a category dropdown inside a horizontally-scrolled table and confirm it is not clipped and clicking an item does not exit row-edit; column filters + date filter presets + sort.
- `rg -n "data-portal-dropdown" src/components/transactions` shows only `PortalDropdown` consumers, no raw `addEventListener('mousedown'` outside-click handlers remain.
- Gate green.

---

## Step 3 — Decompose `invoice-editor.tsx` (1,105 lines)

Same recipe. This editor is one of the three HITL AI editors and registers page context for the omni agent — **do not break either contract.**

### Must-preserve invariants (from CLAUDE.md)
- **HITL confirm pattern**: it uses `usePendingAiChanges<T>()` from `src/hooks/use-pending-ai-changes.ts` (inline implementation in this file). The `stateRef` synced via `useEffect`, `markPending(field, stateRef.current)` before each AI-driven state change, the `ai-changed` CSS class on affected regions, and the Confirm/Undo banner must all survive the refactor unchanged.
- **Page context registration**: it calls `usePageContext({ entityType, entityId, entityName, snapshot, dispatch })`. `dispatch` (the `applyEditorAction` handler) stays client-only and is never serialized. Keep it.
- **Line-items grid**: `grid-cols-[minmax(120px,1fr)_140px_110px_100px_32px]` — the description column uses `minmax(120px,1fr)`, **not** `1fr`. Do not "tidy" this.
- **`isTaxLine`**: tax is a regular `InvoiceLineItem` with `isTaxLine: true`. Keep it in any serialization you move.
- **Notes / payment instructions**: `invoiceNotesDefault` and `invoicePaymentNote` are preference-scoped (saved to `UserPreference.data` on `onBlur`), not stored on the invoice. Keep the onBlur save logic intact.

### Suggested split
```
src/components/projects/invoice-editor.tsx        (orchestrator < 400 lines)
  invoice-editor/
    use-invoice-form.ts          (line items, totals via computeInvoiceTotals, currency, due date, notes)
    use-invoice-ai-changes.ts    (wraps usePendingAiChanges + applyEditorAction dispatch)
    line-items-table.tsx         (the grid)
    invoice-meta-fields.tsx      (client, dates, currency, notes/payment instructions)
    ai-confirm-banner.tsx        (Confirm/Undo banner)
```
Money math stays on `Decimal` via `src/lib/money.ts` (`computeInvoiceTotals`, `lineTotal`) until `toDisplay()` at the render boundary — WS1 rule, enforced.

### Step 3 acceptance
- Editor < 400 lines (orchestrator).
- AI edit flow still highlights + requires Confirm/Undo (test via the omni agent or a manual `applyEditorAction` path).
- PDF/detail-view fields unchanged; gate green.

---

## Step 4 — Decompose `studio-client.tsx` (1,424 lines)

WS6 already moved KPI aggregation to SQL (`src/lib/studio-kpis.ts`) and lazy-loads card detail via `GET /api/studio/clients/[clientProfileId]`. So the data shape is stable — safe to decompose now.

### Must-preserve invariants (from CLAUDE.md / codebase_map "Client Hub")
- **Filter behaviour**: `clientFilter` accepts `'outstanding' | 'overdue' | 'unsent' | 'collected' | 'awaiting-quotes' | 'uninvoiced-quotes'`. Clicking a notice/KPI filters the card list in place and expands matching cards. Filtered cards collapse headers to name + chevron; expanded body shows only filter-relevant items. Preserve exactly.
- **Outstanding vs Overdue are mutually exclusive** and derived **client-side from invoice statuses**, not from `client.outstanding`. Do not change which set each total covers.
- **Lazy-load**: collapsed cards use lightweight summaries; expanded detail fetched on demand. `flatInvoices`/`flatQuotes` props feed notices/pipeline/recent-activity. Keep the fetch-on-expand.
- Clicking an invoice row navigates to the invoice detail page — there is no preview modal.

### Suggested split
```
src/components/studio/studio-client.tsx     (orchestrator < 400 lines)
  studio/
    use-client-filter.ts        (clientFilter state + derived filtered/expanded sets)
    use-client-detail.ts        (lazy fetch of expanded card detail)
    kpi-bar.tsx                 (the KPI strip with filter onClick)
    take-notice-strip.tsx       (notices + onClick → setClientFilter)
    client-card.tsx             (single card: collapsed header + expanded body)
    pipeline-strip.tsx / recent-activity.tsx (if present)
```

### Step 4 acceptance
- Orchestrator < 400 lines.
- Manually verify: each KPI/notice filter expands the right cards and shows the right items; Outstanding excludes overdue; expanding a card fetches detail with a loading state; clicking an invoice row navigates. Gate green.

---

## Step 5 — Decompose `work-order-panel.tsx` (673 lines)

Used by both the job detail (CLIENT) and maintenance detail (PROPERTY) pages.

### Must-preserve invariants (from CLAUDE.md)
- **Polymorphic context**: receives `context` prop `{ type: 'job', jobId }` or `{ type: 'maintenance', maintenanceRequestId }`. Exactly one FK is set; pass the correct one to the API.
- **Vendor can be null**: the expanded panel always shows an inline vendor picker (with `+ New vendor…` inline creation via the `__new__` sentinel). Keep the inline-creation local-state pattern (no server re-query).
- **Bill vendor inheritance**: the bill form has **no vendor picker**; bills inherit `vendorId` from the work order. "Add bill" is blocked until a vendor is assigned. Keep this gate.
- **Local-state mutation**: the panel mutates its own state after creating WOs/bills; the parent page's server-computed margin/costs cards do not update until reload — that is expected, don't try to "fix" it.

### Suggested split
```
src/components/projects/work-order-panel.tsx   (orchestrator < 400 lines)
  work-order-panel/
    use-work-orders.ts          (list state, create WO, add bill, link txn, assign vendor)
    vendor-picker.tsx           (inline + New vendor, __new__ sentinel)
    work-order-row.tsx          (expandable WO with bills + vendor picker)
    bill-form.tsx               (no vendor picker; inherits WO vendor)
```

### Step 5 acceptance
- Orchestrator < 400 lines.
- Manually verify on both a job detail page and a maintenance detail page: create WO, assign vendor inline (+ New vendor), add bill (blocked without vendor), link a transaction. Gate green.

---

## Step 6 — Add the standing rule to `CLAUDE.md`

Add a new gotcha section:

> ### Component size cap — 400 lines + shared PortalDropdown
> No component file may exceed 400 lines. Extract non-visual logic into `use*` hooks (sibling `hooks/` folder) and leaf JSX into their own files. Any dropdown/popover rendered inside a scroll container (`overflow-auto`) must use `src/components/ui/portal-dropdown.tsx` (which renders via `createPortal` into `document.body`, positions with `position: fixed`, and stamps `data-portal-dropdown`) plus `src/hooks/use-outside-click.ts` with `ignoreSelector: '[data-portal-dropdown]'`. Do not hand-roll `useAnchorRect` or `mousedown` capture listeners.

Also update `codebase_map.md`:
- Under the Transactions / Client Hub / Work Order sections, point the "UI" rows at the new orchestrator + note the `hooks/`, `cells/`, etc. subfolders.
- Add a "Shared UI primitives" row for `PortalDropdown` and `useOutsideClick`.

---

## Final verification checklist (run before declaring WS7 done)
- [ ] `pnpm lint && pnpm test && pnpm build` all green.
- [ ] `wc -l src/components/transactions/transaction-table.tsx` < 400.
- [ ] `wc -l src/components/projects/invoice-editor.tsx` < 400.
- [ ] `wc -l src/components/studio/studio-client.tsx` < 400.
- [ ] `wc -l src/components/projects/work-order-panel.tsx` < 400.
- [ ] `rg -n "useAnchorRect" src` returns nothing (absorbed into `PortalDropdown`).
- [ ] `rg -n "data-portal-dropdown" src` shows only the shared component + its consumers, no hand-rolled outside-click handlers.
- [ ] CLAUDE.md has the 400-line + PortalDropdown rule; codebase_map.md updated.
- [ ] Manually walked the flows listed under each step's acceptance — pixel/behaviour identical.

---

## Bugs found (do NOT fix in WS7 — log here)
- _(none yet)_

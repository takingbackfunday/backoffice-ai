# Omni AI Agent — Phase 4 QA Checklist
**Branch:** `main`
**Last commit:** `85559cd` — feat(omni): Phase 4 — omni widget + editor integration

Run through every item below in a local dev environment (`pnpm dev`).
Mark each item **PASS**, **FAIL**, or **SKIP** (with reason).

---

## 1. Build & type-check

| # | Check | Expected |
|---|---|---|
| 1.1 | `npx tsc --noEmit` | Zero errors |
| 1.2 | `pnpm build` (or `pnpm lint`) | Zero errors (warnings about unused props in editor files are pre-existing, not new) |
| 1.3 | `pnpm run build:capabilities` | Exits 0; regenerates `site-capabilities.generated.ts` |

---

## 2. Basic chat widget

| # | Check | Expected |
|---|---|---|
| 2.1 | Open any non-portal page (e.g. `/dashboard`). Click the floating Sparkles button. | Chat panel opens |
| 2.2 | Ask "what did I spend the most on last month?" | Answer streams in. No `[NEEDS_X_AGENT]` bounce. Source is aggregate_transactions tool. |
| 2.3 | Press Escape | Chat panel closes |
| 2.4 | Open the chat. Click the backdrop. | Chat panel closes |
| 2.5 | Open `/portal`, `/apply`, or `/sign` | Floating button is NOT rendered |

---

## 3. Contextual greeting

| # | Check | Expected |
|---|---|---|
| 3.1 | Open chat on `/dashboard` | Greeting mentions "Dashboard" or a JTBD from the dashboard capability |
| 3.2 | Open chat on `/transactions` | Greeting mentions "Transactions" |
| 3.3 | Open `/projects/[slug]/invoices/new`, open chat | Greeting says "I see you're working on invoice" or "You're on New invoice" |
| 3.4 | Open an existing invoice edit page (`/projects/[slug]/invoices/[id]/edit`), open chat | Greeting names the invoice number (e.g. "INV-0042") |
| 3.5 | Close the chat, reopen it | Greeting is shown again (ephemeral — not stored) |
| 3.6 | Send a message, close the chat, reopen it | Previous messages shown (no greeting; history is preserved) |
| 3.7 | The greeting is NOT included when a question is submitted — confirm by checking that `conversationHistory` in the network request body does NOT contain the greeting text | Greeting is ephemeral only |

---

## 4. Link cards

| # | Check | Expected |
|---|---|---|
| 4.1 | From any page, ask "where do I change my business address?" | A `link` SSE event fires; a clickable card appears in the assistant bubble with a route label (e.g. "Settings → Business address") and a one-line reason |
| 4.2 | Click the link card | `router.push` fires; browser navigates to `/settings#business-address` (or equivalent anchor); chat panel stays open |
| 4.3 | Ask "how do I add a payment method?" | Link card to settings payment methods section appears |
| 4.4 | Link cards survive token overwrites — if text continues streaming after the `link` event, the card is still visible in the bubble | Card is not clobbered by subsequent `token` events |
| 4.5 | Multiple link cards in one answer (e.g. "show me everything related to invoices") | All cards render, each with its own label + reason |

---

## 5. Invoice editor — "Ask AI" button

| # | Check | Expected |
|---|---|---|
| 5.1 | Open `/projects/[slug]/invoices/new` | No AI side panel visible. Action buttons row has "Review with AI" and a separate "Ask AI" button |
| 5.2 | Click "Ask AI" | Omni chat widget opens |
| 5.3 | Open `/projects/[slug]/invoices/[id]/edit` | Same — no side panel; "Ask AI" button present |
| 5.4 | "Review with AI" button still works | Clicking it calls `ai-finalize`, applies suggested notes to the form, then opens the omni widget with a follow-up message |

---

## 6. Invoice editor — omni-driven edits (action events)

| # | Check | Expected |
|---|---|---|
| 6.1 | On `/projects/[slug]/invoices/new`, click "Ask AI", type "add a line item for 3 hours of consulting at $200/hr" | Editor line items update; the HITL banner "AI made changes — review the highlighted fields above" appears |
| 6.2 | The updated line item row has a throb/highlight animation | Visual indicator is present (the `ai-changed` CSS class) |
| 6.3 | Click "Confirm" on the HITL banner | Banner disappears; line items stay |
| 6.4 | Repeat 6.1, then click "Undo" | Line items revert to their pre-edit state |
| 6.5 | Ask "set tax to 20% VAT" | Tax field updates with throb; HITL banner appears |
| 6.6 | Ask "change the due date to next Friday" | Due date field updates; HITL banner appears |
| 6.7 | Ask "update the notes to say 'Payment due within 30 days'" | Notes textarea updates; HITL banner appears |

---

## 7. Invoice editor — navigate away mid-conversation

| # | Check | Expected |
|---|---|---|
| 7.1 | Start a conversation on the invoice editor. Navigate to `/dashboard` (without asking a follow-up). Then in the same chat window (if still open), ask the omni to "add a line item". | Chat shows "Tried to apply an edit but the editor is no longer open." |

---

## 8. Estimate editor — "Ask AI" button

| # | Check | Expected |
|---|---|---|
| 8.1 | Open any estimate edit page | No AI side panel. Header has an "Ask AI" button instead of "AI Assist" |
| 8.2 | Click "Ask AI" | Omni chat widget opens |
| 8.3 | Notes field still editable | Normal estimate editing still works |

---

## 9. Cross-domain query (omni vs. old routed agents)

| # | Check | Expected |
|---|---|---|
| 9.1 | On `/dashboard`, ask "which clients owe me money on overdue invoices, and what were the total expenses I tagged to those clients?" | Single coherent answer with both invoice and transaction data — no `[NEEDS_X_AGENT]` bounce in the response |
| 9.2 | Ask a property question while on the `/dashboard` | Answer references property data correctly (tenants, rent roll, etc.) |

---

## 10. `/api/agent/ask` proxy still works

| # | Check | Expected |
|---|---|---|
| 10.1 | POST to `/api/agent/ask` with `{ question: "hello", conversationHistory: [], sessionId: "test" }` via curl or Postman | Returns a valid SSE stream (proxied through omni) |

---

## 11. Regression — page context store cleanup

| # | Check | Expected |
|---|---|---|
| 11.1 | Open the invoice editor so context is set. Navigate away (e.g. to `/transactions`). Open `usePageContextStore.getState().context` in React DevTools or console. | Context is `null` after navigating away (cleared by `usePageContext` unmount) |
| 11.2 | Open the invoice editor again | Context is re-populated with the invoice entity |

---

## 12. Session continuity

| # | Check | Expected |
|---|---|---|
| 12.1 | Have a 5-turn conversation (ask 5 questions). Send a 6th question. | The 6th question still works; conversation history has 5 turns (MAX_TURNS=5, oldest dropped) |
| 12.2 | Click "Clear" in the chat | Messages cleared; next question starts a fresh session |

---

## Known pre-existing issues (do not flag as regressions)

- `chat-overlay.tsx`: `useChatStore` and `useEffect` are called after an early pathname return — pre-existing lint warning, not introduced in Phase 4.
- `invoice-editor.tsx`: `clientEmail` and `isVoidOrPaid` are unused — they were used by the deleted AI side panel; warnings only, not errors.
- `estimate-editor.tsx`: `clientName` and `billingType` props are unused — were used by deleted `handleAiSend`; warnings only.

---

## If a test fails

1. Check the browser network tab for the `/api/agent/omni` SSE stream — look for `action` / `link` event types.
2. Check `usePageContextStore.getState().context` in the console to confirm page context is registered.
3. The omni agent logs tool calls via `status` events — visible in the chat spinner text before streaming begins.
4. For HITL issues: `pendingAiChanges` and `preAiSnapshot` state are in the `InvoiceEditor` component — inspect via React DevTools.

# Omni AI Agent — Handoff Summary
**For:** Next agent implementing Phase 4
**Current branch:** `main`
**Last commit:** `5944eb0` — feat(omni): Phase 3 — omni agent server + ask proxy

---

## What's been done

### Phase 1 — Site capability map (complete)
- 47 `page.capabilities.ts` sidecars, one per route
- `src/lib/agent/site-capabilities-types.ts` — `PageCapability` interface
- `src/lib/agent/site-capabilities-loader.ts` — `findCapability`, `searchCapabilities`, `capabilityIndexSummary`
- `src/lib/agent/site-capabilities.generated.ts` — auto-generated manifest (committed)
- `scripts/build-site-capabilities.ts` — build script with `--check` flag
- `package.json` — `build:capabilities` hooked into `dev` and `build`

### Phase 2 — Page context plumbing (complete)
- `src/lib/agent/page-context.ts` — shared types: `EditorAction`, `EditorActionDispatcher`, `PageContext`, `SerializablePageContext`
- `src/stores/page-context-store.ts` — Zustand store (`usePageContextStore`)
- `src/components/chat/page-context-provider.tsx` — `usePageContext(partial)` hook; registers context on mount, clears on unmount
- `src/components/projects/invoice-editor.tsx` — calls `usePageContext` with `entityType: 'invoice'`, snapshot, and `applyEditorAction` dispatcher. The dispatcher maps `EditorAction` → existing `InvoiceAction` reducer dispatch (`SET_LINE_ITEMS`, `SET_TAX_FROM_AI`, `SET_DUE_DATE`, `SET_NOTES`, `SET_CURRENCY`).
- `src/components/projects/estimate-editor.tsx` — same pattern; only `set_notes` wired for now (full `set_sections` deferred)
- `src/components/dashboard/agent-qa.tsx` — includes `pageContext` in every POST to `/api/agent/ask`
- `src/app/api/agent/ask/route.ts` — accepts `pageContext` in body

### Phase 3 — Omni agent server (complete, QA verified in production)
- `src/app/api/agent/omni/route.ts` — SSE route; emits `session`, `status`, `token`, `action`, `link`, `answer`, `done`, `error`
- `src/lib/agent/omni-agent.ts` — `runOmniAgent(ctx: OmniContext)` runner; page-context-aware system prompt; `buildSnapshot` from Prisma
- `src/lib/agent/omni-tools.ts` — flat read tools (finance + property + studio) + site tools (`lookup_site_capability`, `link_user_to`) + subordinate tools (`consult_rules_agent`, `apply_invoice_edits`, `apply_estimate_edits`); editor tools conditionally included based on `editorContext` from capability sidecar
- `src/lib/agent/types.ts` — `SseEvent` extended with `action` (target, action) and `link` (route, anchor, label, reason) event types
- `src/app/api/agent/ask/route.ts` — now a thin proxy to `runOmniAgent`; `orchestrate()` no longer called

**QA verified in production:**
- Finance query → `aggregate_transactions` called, streamed answer
- Navigation query → `lookup_site_capability` + `link_user_to` called, `link` SSE event emitted pointing at `/settings#business-address`
- Editor drive → `apply_invoice_edits` called, `action` SSE event emitted with `set_line_items` payload

---

## What still needs to be done

### Phase 4 — Omni widget + editor integration (your task)

This is the first **user-visible** phase. Four discrete pieces of work:

---

#### 4a. `<ChatOverlay>` — handle `action` and `link` SSE events

File: `src/components/chat/chat-overlay.tsx`

The overlay already handles `status`, `token`, `answer`, `done`, `error`, `session`. Extend it to handle two new event types:

**`action` events:**
```ts
if (event.type === 'action') {
  const dispatch = usePageContextStore.getState().context?.dispatch
  if (dispatch) {
    dispatch(event.action)
  } else {
    // editor unmounted / user navigated away
    appendAssistantMessage("Tried to apply an edit but the editor is no longer open.")
  }
}
```

**`link` events** — render an inline clickable card inside the current assistant message bubble:
```
[Settings → Business address]   ← Next.js <Link> or router.push
Change your business address here.
```
- Clicking navigates to `event.route + (event.anchor ?? '')` — use `router.push` from `next/navigation`
- The chat panel stays open after navigation
- The card renders inside the message text, not as a separate bubble
- Label: `event.label ?? event.route`
- Subtitle: `event.reason`

Read the existing SSE parsing loop in `chat-overlay.tsx` carefully before modifying — the token accumulation pattern matters. `link` cards should slot into the message being assembled, not create a new turn.

---

#### 4b. Contextual greeting on widget open

When `<ChatOverlay>` opens with no conversation yet, show a greeting as an ephemeral assistant message (not added to `conversationHistory` — so it never leaks into prompts).

Logic (purely client-side, no LLM call):
```ts
const ctx = usePageContextStore.getState().context
const cap = ctx?.routeTemplate ? findCapability(ctx.pathname) : null

let greeting: string
if (ctx?.entityType && ctx?.entityName) {
  greeting = `I see you're working on ${ctx.entityType} ${ctx.entityName}. What would you like to do?`
} else if (cap?.title) {
  greeting = `You're on ${cap.title}. ${cap.jobsToBeDone[0] ?? ''} — or ask me anything about your business.`
} else {
  greeting = `Ask me about your finances, properties, or clients.`
}
```

The greeting renders as the first message in the chat panel when it opens. It disappears if the user closes and reopens (ephemeral per-open, not stored).

---

#### 4c. Remove invoice/estimate AI side panels; add "Ask AI" toolbar button

**`src/components/projects/invoice-editor.tsx`:**
- Delete the AI side panel JSX block (the right-hand chat panel that appears when `chatVisible` is true)
- Delete the chat-related state and handlers that drove it: `chatMessages`, `chatLoading`, `chatVisible`, `sendChatMessage`, `applyAiAction`, `confirmAiChanges`, `undoAiChanges`, and any `useEffect` that called `/api/projects/.../invoices/ai-assist`
- **Keep** the reducer cases `SET_TAX_FROM_AI`, `SET_NOTES` with `aiSuggested`, `SET_LINE_ITEMS`, `SET_DUE_DATE`, `SET_CURRENCY` — these are still used by the dispatcher wired in Phase 2
- **Keep** the `usePageContext` call wired in Phase 2
- Add a small "Ask AI" button in the invoice editor toolbar (near the Save/Send buttons). On click: `useChatStore.getState().open()` (or `.toggle()` — check `src/stores/chat-store.ts` for the correct method name)
- The button can reuse the existing `Sparkles` icon if it's already imported

**`src/components/projects/estimate-editor.tsx`:** same surgery, same pattern.

Do **not** delete the `/api/projects/[id]/invoices/ai-assist` or `/api/projects/[id]/estimates/[estId]/ai-assist` routes yet — that's Phase 5.

---

#### 4d. Point `<ChatOverlay>` at `/api/agent/omni`

The overlay currently POSTs to `/api/agent/ask`. Change it to POST to `/api/agent/omni`. The request body shape is identical — `omni` just accepts one extra optional field (`pageContext`) which the overlay already sends (wired in Phase 2 via `agent-qa.tsx`... but verify where the overlay itself sends its requests and update that call site).

---

## Critical files — read before implementing

| File | Why |
|---|---|
| `src/components/chat/chat-overlay.tsx` | Main file for 4a, 4b, 4d. Read the full SSE parsing loop and message state shape before touching. |
| `src/stores/chat-store.ts` | Check the method name to open the chat programmatically (`open`, `toggle`, `openWithMessage`?) — needed for the "Ask AI" button. |
| `src/stores/page-context-store.ts` | `usePageContextStore` — read `.context?.dispatch` for action delivery. |
| `src/components/chat/page-context-provider.tsx` | `findCapability` import — reuse for the greeting logic. |
| `src/components/projects/invoice-editor.tsx` | Identify exactly which JSX block is the AI side panel and which state vars drive it before deleting. Read the full file first. |
| `src/components/projects/estimate-editor.tsx` | Same. |
| `src/lib/agent/page-context.ts` | `EditorAction` union — what the `dispatch` callback accepts. |

---

## Gotchas / constraints

### Token accumulation in chat-overlay
The existing SSE loop likely accumulates `token` events into a running string and sets the last assistant message text directly (not appends — per the CLAUDE.md "token events carry full text, not delta" note). Understand this before adding `link` card rendering inside the message — the card needs to survive token overwrites.

### `link` cards coexist with streamed text
A `link` event can arrive before, during, or after `token` events for the same turn. The simplest approach: store link cards separately in the message object (`links: LinkPayload[]`) and render them below the text content. That way token accumulation doesn't clobber them.

### `dispatch` is client-only
`context.dispatch` is never serialized — it's the live React dispatch function set by the editor component. If the user navigates away from the invoice editor mid-conversation, `context` will be null or won't have a `dispatch`. Handle gracefully (the "editor is no longer open" fallback message).

### `usePageContext` cleanup on unmount
The `usePageContext` hook clears the store on unmount. So when the invoice editor unmounts, `context` becomes null. The overlay should tolerate `context === null` for action events.

### Chat store — `MAX_TURNS`
Phase 3 did not raise `MAX_TURNS` from 3 to 5 as the PRD suggested. Do it in Phase 4 when touching `chat-store.ts`:
```ts
export const MAX_TURNS = 5
```

### Don't touch these files
- `src/lib/agent/finance-tools.ts`
- `src/lib/agent/property-tools.ts`
- `src/lib/agent/studio-tools.ts`
- `src/lib/agent/rules-tools.ts`
- `src/lib/agent/run-rules-agent.ts`
- `src/lib/agent/tool-loop.ts`
- `src/app/api/agent/rules/route.ts`
- `src/app/api/agent/omni/route.ts`
- `src/lib/agent/omni-agent.ts`
- `src/lib/agent/omni-tools.ts`

---

## Verification (Phase 4)

No automated tests — manual checks:

1. **Action delivery** — open `/projects/.../invoices/new`, click "Ask AI", type "add a line item for 2 hours at $150". Editor line items should update with throb highlight + confirm/undo bar.
2. **Undo** — click Undo on the confirm bar → state reverts to pre-edit.
3. **Link card** — from any page, ask "where do I add a payment method?" → a clickable link card appears in the chat. Clicking it navigates to `/settings#payment-methods` (or wherever the capability sidecar points) and the chat stays open.
4. **Contextual greeting** — open the chat on `/dashboard`, `/transactions`, and `/projects/.../invoices/inv-xxx` — each should show a different opener. The invoice page should mention the invoice number.
5. **Navigator away** — start a conversation on the invoice editor, then navigate to `/dashboard`, then ask the omni to "add a line item". Should get the "editor is no longer open" fallback message.
6. **`/api/agent/ask` still works** — the existing chat widget (if it still POSTs to `/ask`) should continue to work since `ask` proxies to omni. After switching to `/omni`, verify the widget works end-to-end.

---

## Phase 5 (not your task)

After Phase 4 ships:
- Delete `orchestrator.ts`, `domain-classifier.ts`, `finance-agent.ts`, `property-agent.ts`, `studio-agent.ts`
- Delete `/api/agent/ask/route.ts` (the proxy)
- Delete `/api/projects/[id]/invoices/ai-assist/route.ts` and `.../estimates/[estId]/ai-assist/route.ts`
- Switch CI capability check from warning to hard fail
- Remove `AgentDomain`, `DomainClassification`, `Agent`, `AgentResult` from `types.ts`

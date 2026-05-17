# Omni AI Agent — Handoff Summary
**For:** Next agent implementing Phase 3
**Current branch:** `main`
**Last commit:** `86cd457` — feat(omni): Phase 2 — page context plumbing

---

## What's been done

### Phase 1 — Site capability map (complete)

**New files:**
- `src/lib/agent/site-capabilities-types.ts` — `PageCapability` interface
- `src/lib/agent/site-capabilities-loader.ts` — `findCapability(pathname)`, `searchCapabilities(query, limit)`, `capabilityIndexSummary()`
- `src/lib/agent/site-capabilities.generated.ts` — auto-generated manifest (47 capabilities, committed to repo)
- `scripts/build-site-capabilities.ts` — build script; `--check` flag exits non-zero if any active `page.tsx` is missing a sidecar

**47 capability sidecars written** — one per page at `src/app/<route>/page.capabilities.ts`. All project sub-routes, property management pages, and infra pages covered.

**`package.json` scripts:**
- `build:capabilities` — `tsx scripts/build-site-capabilities.ts`
- `dev` and `build` both run `build:capabilities` first

**Key capability flag:** `editorContext: 'invoice' | 'estimate'` — set on exactly 4 pages:
- `/projects/[slug]/invoices/new`
- `/projects/[slug]/invoices/[invoiceId]/edit`
- `/projects/[slug]/estimates/new`
- `/projects/[slug]/estimates/[estId]`

The invoice detail view (`/projects/[slug]/invoices/[invoiceId]`) is read-only — no `editorContext`.

---

### Phase 2 — Page context plumbing (complete)

**New files:**

`src/lib/agent/page-context.ts` — shared types:
```ts
export interface SerializableLineItem {
  id: string; description: string; quantity: string
  qtyUnit: string; unitPrice: string; isTaxLine: boolean
}
export type EditorAction =
  | { type: 'set_line_items'; lineItems: SerializableLineItem[] }
  | { type: 'set_tax'; label: string; amount: number }
  | { type: 'set_due_date'; value: string }
  | { type: 'set_notes'; value: string }
  | { type: 'set_currency'; value: string }
export type EditorActionDispatcher = (action: EditorAction) => void
export interface PageContext {
  pathname: string
  routeTemplate: string | null
  entityType?: 'invoice' | 'estimate' | 'quote' | 'transaction' | 'project' | 'tenant'
  entityId?: string
  entityName?: string
  snapshot?: Record<string, unknown>
  dispatch?: EditorActionDispatcher  // never sent to server
}
export type SerializablePageContext = Omit<PageContext, 'dispatch'>
```

`src/stores/page-context-store.ts` — Zustand store:
```ts
export const usePageContextStore = create<PageContextStore>((set) => ({
  context: null,
  setContext: (context) => set({ context }),
}))
```

`src/components/chat/page-context-provider.tsx` — `usePageContext(partial)` hook:
- Calls `findCapability(pathname)` to resolve `routeTemplate`
- Registers context in the store on mount, clears on unmount
- Re-runs effect when `pathname`, `entityType`, `entityId`, or `entityName` change

**Modified files:**
- `src/components/dashboard/agent-qa.tsx` — reads `usePageContextStore()`, strips `dispatch`, includes `pageContext` in every POST to `/api/agent/ask`
- `src/app/api/agent/ask/route.ts` — accepts `pageContext` field in body (silently ignored, comment-noted for Phase 3)
- `src/components/projects/invoice-editor.tsx` — calls `usePageContext({ entityType: 'invoice', entityId, entityName, snapshot, dispatch: applyEditorAction })`. The `applyEditorAction` callback maps `EditorAction` → the existing `InvoiceAction` reducer dispatch (`SET_LINE_ITEMS`, `SET_TAX_FROM_AI`, `SET_DUE_DATE`, `SET_NOTES`, `SET_CURRENCY`).
- `src/components/projects/estimate-editor.tsx` — same pattern; only `set_notes` is wired for now. Full `set_sections` mapping deferred to Phase 3.

---

## What still needs to be done

### Phase 3 — Omni agent server (your task)

**New files to create:**

#### `src/app/api/agent/omni/route.ts`
SSE route, same keepalive/encode pattern as `src/app/api/agent/ask/route.ts`. Request shape:
```ts
POST /api/agent/omni
{
  question: string
  conversationHistory: ConversationTurn[]
  sessionId?: string
  pageContext?: SerializablePageContext
}
```
SSE events — extend existing `SseEvent` union with two new types:
- `action` — `{ type: 'action', target: 'invoice' | 'estimate', action: EditorAction }` — emitted when `apply_invoice_edits` / `apply_estimate_edits` is called
- `link` — `{ type: 'link', route: string, anchor?: string, label?: string, reason: string }` — emitted when `link_user_to` is called

The route should emit `session`, `status`, `token`, `action`, `link`, `answer`, `done`, `error` events (same keepalive + encode pattern as the ask route).

**Also make the ask route a thin proxy to omni:** At the end of Phase 3, replace the `orchestrate()` call in `ask/route.ts` with a call to `runOmniAgent()`. This keeps old clients working.

---

#### `src/lib/agent/omni-agent.ts`
Runner. Signature:
```ts
interface OmniContext {
  userId: string
  question: string
  conversationHistory: ConversationTurn[]
  pageContext?: SerializablePageContext
  onStatus: (message: string) => void
  onToken: (text: string) => void
  onAction: (target: 'invoice' | 'estimate', action: EditorAction) => void
  onLink: (link: { route: string; anchor?: string; label?: string; reason: string }) => void
}
interface OmniResult { answer: string; toolsUsed: string[] }

export async function runOmniAgent(ctx: OmniContext): Promise<OmniResult>
```

Model: `anthropic/claude-sonnet-4-6` (same model string used by the existing agents — check `src/lib/agent/finance-agent.ts` for the exact string). Max rounds: 8.

The runner should:
1. Call `buildSnapshot(userId)` (exists in existing agent files — see finance-agent.ts or orchestrator.ts) to get user data counts
2. Call `findCapability(pageContext.pathname)` to get the current page's capability
3. Build messages array with system prompt + user question
4. Call `runToolLoop` from `src/lib/agent/tool-loop.ts`

**System prompt structure** (critical — matches existing agent behaviour):
```
You are Backoffice — an AI assistant embedded in a property/finance/freelance back-office app.

Today's date is {YYYY-MM-DD}.

USER'S DATA SHAPE:
{snapshot}

CURRENT CONTEXT:
The user is on: {capability.title} ({pageContext.pathname})
Page purpose: {capability.purpose}
[If entityType set]: They are currently viewing/editing {entityType} "{entityName}".
[If editorContext set]: You can use apply_{editorContext}_edits to modify the form they're working on.
Actions will appear in their editor with a throb highlight and a confirm/undo bar.

WHAT THIS APP CAN DO (compact index):
{capabilityIndexSummary()}

For deeper detail on any page, call lookup_site_capability.

CONVERSATION SO FAR:
{formatHistory(conversationHistory)}

CRITICAL RULES:
1. NEVER state a dollar amount you have not directly read from a tool result.
2. For totals, use aggregate_* tools — never sum lists in your head.
3. Non-deductible categories are excluded from revenue/expense queries unless the user explicitly asks.
4. If the user asks where to do something, call lookup_site_capability first, then link_user_to.
5. If on an editor page and the user asks for a change, prefer apply_*_edits over instructing them to type.
6. Plain text only. No markdown (no #, no **, no bullet syntax).
```

The "plain text only" rule is **critical** — it matches all existing agents in this codebase.

---

#### `src/lib/agent/omni-tools.ts`
Tool aggregator and dispatcher.

**Existing tool arrays and dispatchers to import (do not modify these files):**
- `src/lib/agent/finance-tools.ts` → `FINANCE_TOOLS: ToolDefinition[]`, `dispatchTool(userId, name, args): Promise<string>`
- `src/lib/agent/property-tools.ts` → `PROPERTY_TOOLS: ToolDefinition[]`, `dispatchPropertyTool(userId, toolName, args): Promise<string>`
- `src/lib/agent/studio-tools.ts` → `STUDIO_TOOLS: ToolDefinition[]`, `dispatchStudioTool(userId, name, args): Promise<string>`

**Tool routing:** Build `Set<string>` from each domain's tool array for O(1) routing. Pattern:
```ts
const PROPERTY_TOOL_NAMES = new Set(PROPERTY_TOOLS.map(t => t.function.name))
const STUDIO_TOOL_NAMES   = new Set(STUDIO_TOOLS.map(t => t.function.name))
// finance is the fallback (largest set)
```

**Two new site tools:**
```ts
lookup_site_capability(query: string) → JSON.stringify(searchCapabilities(query, 5))
link_user_to(route, anchor?, label?, reason) → calls onLink callback, returns confirmation string
```

**Three subordinate tools:**
```ts
consult_rules_agent({ instruction: string })   → wrap runRulesAgent (see src/lib/agent/run-rules-agent.ts)
apply_invoice_edits({ actions: EditorAction[] }) → calls onAction('invoice', action) per action
apply_estimate_edits({ actions: EditorAction[] }) → calls onAction('estimate', action) per action
```

**Conditional inclusion** — `getOmniTools(pageContext?)`:
- Always include: all read tools + site tools + `consult_rules_agent`
- Include `apply_invoice_edits` only when `pageContext?.routeTemplate` matches `/projects/[slug]/invoices/new` or `/projects/[slug]/invoices/[invoiceId]/edit` (i.e. `editorContext === 'invoice'`)
- Include `apply_estimate_edits` only when `editorContext === 'estimate'`
- Easiest way: check the resolved capability's `editorContext` field via `findCapability(pageContext.pathname)`

**Dispatcher signature:**
```ts
export async function dispatchOmniTool(opts: {
  userId: string
  name: string
  args: unknown
  pageContext?: SerializablePageContext
  onAction: (target: 'invoice' | 'estimate', action: EditorAction) => void
  onLink: (link: LinkPayload) => void
}): Promise<string>
```

---

## Critical files — read before implementing

| File | Why |
|---|---|
| `src/lib/agent/tool-loop.ts` | `runToolLoop` — reuse unchanged. Takes `{ messages, tools, dispatchTool, model, maxRounds, onStatus, onToken }`. Returns `{ answer, toolsUsed }`. |
| `src/lib/agent/format-history.ts` | `formatHistory(turns)` — reuse for conversation history in system prompt. |
| `src/lib/agent/site-capabilities-loader.ts` | `findCapability(pathname)`, `searchCapabilities(query, limit)`, `capabilityIndexSummary()` — all used by the omni. |
| `src/app/api/agent/ask/route.ts` | Copy the SSE scaffolding (encode, keepAlive, stream setup). The omni route is identical except it calls `runOmniAgent` and handles two extra event types. |
| `src/lib/agent/finance-agent.ts` | Read to find the `buildSnapshot(userId)` helper and the exact model string. |
| `src/lib/agent/orchestrator.ts` | Read to understand what the ask route currently calls so you can replace it with `runOmniAgent`. |
| `src/lib/agent/types.ts` | `SseEvent` union — extend it with `action` and `link` event types here. Also `ConversationTurn` shape. |
| `src/lib/agent/page-context.ts` | `EditorAction`, `SerializablePageContext` — already defined. Import from here. |
| `src/lib/agent/run-rules-agent.ts` | `runRulesAgentInBackground` and the synchronous runner — read the export signatures before wrapping as `consult_rules_agent`. |

---

## Gotchas / constraints

### Model string
The existing agents use `openrouterWithTools` from `src/lib/llm/openrouter.ts`. Check `finance-agent.ts` for the exact model ID string — it's something like `anthropic/claude-sonnet-4-6` but confirm before using.

### `buildSnapshot`
This helper likely lives in one of the existing agent files. Grep for it:
```bash
grep -rn "buildSnapshot\|async function.*Snapshot\|userSnapshot" src/lib/agent/
```
If it doesn't exist as a standalone export, extract it — it returns a compact string describing the user's data (account count, transaction date range, workspace types, etc.).

### `runToolLoop` — no `send` param
`runToolLoop` does not accept a `send` callback — it uses `onStatus` and `onToken`. The `action` and `link` SSE events are emitted via the `onAction` / `onLink` callbacks you pass to `dispatchOmniTool`, not via tool-loop. The route wires these callbacks to `send({ type: 'action', ... })` and `send({ type: 'link', ... })`.

### `consult_rules_agent` — synchronous call, not streaming
`runRulesAgent` streams suggestions back via SSE in the rules manager context. For the omni's `consult_rules_agent` tool, call it synchronously and return a summary string. Do not try to forward the rules SSE stream through the omni stream — just return a text summary of what the rules agent found.

### SseEvent union needs extending
Add to `src/lib/agent/types.ts`:
```ts
export interface SseEvent {
  type: 'status' | 'token' | 'answer' | 'done' | 'error' | 'session' | 'action' | 'link'
  // existing fields...
  // new fields:
  target?: 'invoice' | 'estimate'   // for action events
  action?: EditorAction              // for action events
  route?: string                    // for link events
  anchor?: string                   // for link events
  label?: string                    // for link events
  reason?: string                   // for link events
}
```
Or use a discriminated union — whichever TypeScript approach fits existing conventions in the file.

### ask/route.ts proxy
The PRD says to replace `orchestrate()` with a thin call to `runOmniAgent()` at the end of Phase 3. This means the ask route and omni route both call the same runner — the only difference is the ask route has no `action` / `link` SSE handlers yet (those go to the chat overlay in Phase 4). For Phase 3, the proxy can no-op on those callbacks:
```ts
onAction: () => {},
onLink: () => {},
```

### Do not touch these files
- `src/lib/agent/finance-tools.ts`
- `src/lib/agent/property-tools.ts`
- `src/lib/agent/studio-tools.ts`
- `src/lib/agent/rules-tools.ts`
- `src/lib/agent/run-rules-agent.ts`
- `src/lib/agent/tool-loop.ts`
- `src/app/api/agent/rules/route.ts`

---

## Verification (Phase 3)

No UI changes — test via curl or the network tab:

```bash
# Basic cross-domain query (no page context)
curl -N -X POST http://localhost:3000/api/agent/omni \
  -H "Content-Type: application/json" \
  -d '{"question":"what did I spend on groceries last month","conversationHistory":[]}'
# Expect: status events, token events, a numeric answer, done event

# Site navigation query
curl -N -X POST http://localhost:3000/api/agent/omni \
  -H "Content-Type: application/json" \
  -d '{"question":"where do I change my business address","conversationHistory":[]}'
# Expect: a link event pointing at /settings#business-address

# Editor context query (with pageContext)
curl -N -X POST http://localhost:3000/api/agent/omni \
  -H "Content-Type: application/json" \
  -d '{
    "question":"add a line item for 3 hours consulting at 200 per hour",
    "conversationHistory":[],
    "pageContext":{
      "pathname":"/projects/acme/invoices/inv-123/edit",
      "routeTemplate":"/projects/[slug]/invoices/[invoiceId]/edit",
      "entityType":"invoice",
      "entityId":"inv-123",
      "entityName":"INV-0042",
      "snapshot":{"lineItems":[],"currency":"USD"}
    }
  }'
# Expect: action events with set_line_items payload, then token/answer events
```

After wiring the proxy, verify the existing chat widget still works end-to-end (open `/dashboard`, ask a question).

---

## Phase 4 (not your task)

After Phase 3 ships:
- `src/components/chat/chat-overlay.tsx` needs to handle `action` and `link` SSE events (dispatch to `usePageContextStore().context.dispatch`, render link cards)
- Invoice/estimate AI side panels get removed; "Ask AI" button added to toolbar
- Contextual greeting on widget open

Phase 5 is cleanup: delete `orchestrator.ts`, `domain-classifier.ts`, `finance-agent.ts`, `property-agent.ts`, `studio-agent.ts`, and the `/api/agent/ask` proxy once all clients are on `/api/agent/omni`.

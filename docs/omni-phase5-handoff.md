# Omni AI Agent — Phase 5 Handoff
**Branch:** `main`
**Last commit at handoff:** `fb1ed1a`
**Predecessor doc:** `docs/omni-phase4-qa.md`

Phase 5 is pure cleanup. The omni is live and working. This phase deletes the old multi-agent stack, removes two deprecated API routes, and flips the CI capability check from warning to hard fail.

---

## What was built in Phases 1–4 (context)

- `/api/agent/omni` — the single omni agent route (live, in production)
- `/api/agent/ask` — now a thin proxy to omni; kept one release, delete in this phase
- `src/lib/agent/omni-agent.ts` — runner
- `src/lib/agent/omni-tools.ts` — flat tool aggregator
- `src/lib/agent/site-capabilities*.ts` — capability map system
- `src/stores/page-context-store.ts` — page context Zustand store
- `src/components/chat/page-context-provider.tsx` — `usePageContext` hook

---

## Files to DELETE

All safe to delete — nothing in the live app imports them except each other and `/api/agent/ask`.

```
src/lib/agent/orchestrator.ts
src/lib/agent/domain-classifier.ts
src/lib/agent/finance-agent.ts
src/lib/agent/property-agent.ts
src/lib/agent/studio-agent.ts
src/app/api/agent/ask/route.ts           ← proxy; no client outside finance-qa.tsx uses it directly (see below)
src/app/api/projects/[id]/estimates/[estId]/ai-assist/route.ts
```

**Do NOT delete yet:**
```
src/app/api/projects/[id]/invoices/ai-assist/route.ts   ← still called by invoice-editor.tsx "Review with AI" button (ai-finalize route, not ai-assist — confirm below)
src/app/api/projects/[id]/invoices/ai-finalize/route.ts ← actively used — see §Gotchas
src/lib/agent/format-history.ts                         ← still imported by omni-agent.ts; inline or keep
src/app/api/agent/search-transactions/route.ts          ← still used by transaction-table.tsx; keep
src/app/api/agent/analyze/route.ts                      ← still used by dashboard-analyzer.tsx; keep
```

---

## Files to MODIFY

### 1. `src/lib/agent/types.ts` — remove dead domain types

Remove these exports (nothing outside the deleted files uses them):
- `AgentDomain`
- `DomainClassification`
- `Agent`
- `AgentResult`
- `AgentContext` (if present)

**Keep:**
- `ConversationTurn` — used by `chat-store.ts`, `omni-agent.ts`, route handlers
- `SseEvent` — used by omni and ask route handlers

After removing `AgentDomain`, `chat-store.ts` line 2 will need updating — see below.

### 2. `src/stores/chat-store.ts` — drop `AgentDomain` from `addTurn`

Current signature:
```ts
addTurn: (role: 'user' | 'assistant', content: string, domain: AgentDomain | 'cross-domain') => void
```

The `domain` param is vestigial — the omni is always `'cross-domain'`. Remove the param:
```ts
addTurn: (role: 'user' | 'assistant', content: string) => void
```

Then update all three call sites in `src/components/dashboard/agent-qa.tsx` (lines ~176–177) which currently pass `'cross-domain'` as the third arg.

### 3. `src/components/dashboard/finance-qa.tsx` — assess and likely delete

`finance-qa.tsx` still calls `/api/agent/ask` (line 41). Check whether this component is mounted anywhere:
```bash
grep -rn "FinanceQA" src/ --include="*.tsx"
```
If it's not mounted on any page, delete the file. If it is, point it at `/api/agent/omni` and remove the file once confirmed dead.

### 4. `src/lib/agent/format-history.ts` — inline into omni-agent or keep

`format-history.ts` is imported by the three agent files being deleted AND by `omni-agent.ts`. Once the agent files are gone it has a single consumer. Options:
- **Keep as-is** (simplest — one-liner import, file is tiny).
- **Inline** the function body into `omni-agent.ts` and delete the file.

Either is fine. Do not leave it as an orphan without checking omni-agent still imports it.

### 5. `.github/workflows/deploy.yml` — flip CI capability check to hard fail

Currently the `build:capabilities --check` step exits with a warning. Change it to a hard fail:
```yaml
- name: Check page capabilities
  run: pnpm run build:capabilities --check
  # Remove any `continue-on-error: true` flag if present
```
Verify the `--check` flag is wired in `scripts/build-site-capabilities.ts` to exit non-zero when any `page.tsx` is missing a sidecar. If it isn't, add it.

---

## Gotchas

### `ai-finalize` is NOT the same as `ai-assist`
`src/app/api/projects/[id]/invoices/ai-finalize/route.ts` is **actively called** by the invoice editor's "Review with AI" button (invoice-editor.tsx line ~450). Do not delete it. The PRD marked `ai-assist` for deletion, not `ai-finalize`.

To confirm which is which before deleting:
```bash
grep -n "ai-assist\|ai-finalize" src/components/projects/invoice-editor.tsx
```
Only delete the route that doesn't appear in that output.

### `estimate ai-assist` may still be reachable
`src/app/api/projects/[id]/estimates/[estId]/ai-assist/route.ts` — verify no estimate editor component calls it before deleting:
```bash
grep -rn "ai-assist" src/components/projects/estimate-editor.tsx
```
If the output is empty, safe to delete.

### `AgentDomain` is still in `chat-store.ts`
After deleting `types.ts` exports, TypeScript will error on `chat-store.ts`. Fix that file before committing the types cleanup or the build will break.

### `format-history.ts` must survive until omni-agent no longer needs it
Delete order matters: delete agent files first, then check `format-history.ts` import count, then decide.

---

## Suggested commit order

1. Delete `orchestrator.ts`, `domain-classifier.ts`, `finance-agent.ts`, `property-agent.ts`, `studio-agent.ts`. Run `tsc --noEmit` — expect errors only in `types.ts` and `chat-store.ts`.
2. Clean up `types.ts` (remove dead exports). Fix `chat-store.ts` `addTurn` signature. Fix `agent-qa.tsx` call sites. Run `tsc --noEmit` — should be clean.
3. Assess and delete `finance-qa.tsx` if unmounted.
4. Delete `src/app/api/agent/ask/route.ts` and `src/app/api/projects/[id]/estimates/[estId]/ai-assist/route.ts` (after confirming estimate editor doesn't call it).
5. Decide on `format-history.ts` (inline or keep).
6. Flip CI hard-fail. Verify `--check` exits non-zero correctly.
7. Final: `pnpm build` end-to-end. `grep -r 'orchestrator\|domain-classifier\|finance-agent\|property-agent\|studio-agent' src/` returns nothing.

---

## Verification (from PRD §10 Phase 5)

- `pnpm build` passes.
- `grep -r 'orchestrator\|domain-classifier\|finance-agent\|property-agent\|studio-agent' src/` returns nothing.
- The previously-embedded invoice/estimate AI panels are gone (completed in Phase 4 — just confirm they didn't come back).
- CI capability check exits non-zero when a `page.capabilities.ts` is manually deleted.
- Omni still answers correctly after all deletions (smoke test: ask one cross-domain question on `/dashboard`).

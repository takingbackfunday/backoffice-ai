# SDD — Quote templates: finish the loop (author / use / manage) + starter templates

## 1. Background & problem statement

Commit `6c7699d` ("Estimate→Quote full merge (Option B)") introduced the reuse layer
(`QuoteTemplate`, `ServiceItem`, creation picker). Only the *use* half was wired; the
*author* and *manage* halves are broken or dead code. Verified findings:

| # | Finding | Evidence |
|---|---------|----------|
| B1 | "Save as template" on quote detail POSTs to `/api/projects/[id]/quotes/[quoteId]/save-template` — **route does not exist** → always fails | `quote-detail-client.tsx:375-393`; `ls src/app/api/projects/[id]/quotes/[quoteId]/` shows no `save-template` |
| B2 | `SaveTemplateModal` (the correct flow: name → `POST /api/quote-templates`) is **imported nowhere** | `grep SaveTemplateModal` → only its own file |
| B3 | `quote-editor.tsx` has **no** save-as-template affordance (SDD required editor header + detail) | `quote-editor.tsx` header L150-192 |
| B4 | New-quote "From template" fails silently: select hidden when `templates.length === 0` (no empty state); "— none —" submits without `templateId` → blank quote | `new-quote-form.tsx:46-48, 118-132` |
| B5 | No template management UI; `DELETE /api/quote-templates/[templateId]` orphaned | route exists, zero callers |
| B6 | `ServiceItemPicker` is dead code; `onSaveToLibrary` in editor is a no-op stub → bookmark button does nothing | `grep ServiceItemPicker` → only its own file; `quote-editor.tsx:254-256` |
| B7 | Quote-from-template title uses **first section name** instead of template name | `api/projects/[id]/quotes/route.ts:109` |
| B8 | No starter templates — picker is empty until the user authors one (which is impossible, per B1–B3) | locked SDD decision was "no seeds"; **user has now reversed this** |

**Locked decisions (from user, 2026-08-07):**
1. Scope = templates **and** service-item library wiring.
2. Wire `SaveTemplateModal` into quote editor header **and** quote detail. (Detail data already
   contains `costRate`/`tags` — page serializes the full quote; only the client **type** hides them.)
3. Settings gets a "Quote templates" section: list (name, section/item counts, usageCount) + delete.
4. Starter templates: user picks from **10 curated freelance trades** (static skeletons) **or**
   describes their work in free text → **LLM generates** their starter templates.
5. Fix B7 (`title ?? template.name`).

No DB schema changes — `QuoteTemplate` and `ServiceItem` models already exist.

---

## 2. Architecture

```
AUTHOR                                  USE
──────                                  ───
quote-editor.tsx                        new-quote-form.tsx ("From template")
  └ "Save as template" btn ──┐            └ template select ──► POST /api/projects/[id]/quotes
quote-detail-client.tsx      │                                       { jobId, title?, templateId }
  └ "Save as template" btn ──┤                                       (exists; fix title at L109)
                             ▼
                    SaveTemplateModal (exists — wire it)
                             └ POST /api/quote-templates (exists)

MANAGE                                  STARTER (new)
──────                                  ───────────────
settings/page.tsx                       starter-templates.tsx (shared component)
  └ QuoteTemplatesEditor (new)            ├ pick 1 of 10 trades ──► POST /api/quote-templates/starter { trade }
    ├ GET /api/quote-templates            └ or describe work ─────► POST /api/quote-templates/starter { description }
    │   (extend select: + sections)                                        │
    └ DELETE /api/quote-templates/[id] (exists)                  starter/route.ts (new)
                                                                 ├ trade → STARTER_TRADES lookup (static)
                                                                 └ description → openrouterChat → zod-validate
                                                                   → prisma.quoteTemplate.createMany
SERVICE LIBRARY (wire existing pieces)
─────────────────────────────────────
quote-editor.tsx section footer: <ServiceItemPicker onSelect={dispatch ADD_ITEM} />   (picker already built, uses PortalDropdown ✓)
quote-line-items-table.tsx bookmark btn → useSaveToLibrary() → POST /api/service-items (400-dup = "already in library" feedback)
```

**Single source of truth for the template shape:** one zod schema module
(`src/lib/starter-templates.ts`) reused by (a) curated trade data, (b) the starter route's
LLM-output validation, (c) `POST /api/quote-templates` body schema (replace its inline item
schema — same shape, no behavior change).

---

## 3. Files

### NEW `src/lib/starter-templates.ts`

Zod schemas (export all):

```ts
import { z } from 'zod'

export const TemplateItemSchema = z.object({
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  quantity: z.number().positive().default(1),
  rate: z.number().nonnegative().nullable().optional(),
  costRate: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string()).default([]),
  isOptional: z.boolean().default(false),
})

export const TemplateSectionSchema = z.object({
  name: z.string().min(1),
  items: z.array(TemplateItemSchema).min(1),
  sortOrder: z.number().int().nonnegative().optional(),
})

export const StarterTemplateSchema = z.object({
  name: z.string().min(1),
  sections: z.array(TemplateSectionSchema).min(1),
})

export type StarterTemplate = z.infer<typeof StarterTemplateSchema>

export interface StarterTrade { id: string; label: string; templates: StarterTemplate[] }

export const STARTER_TRADES: StarterTrade[] = [ /* 10 trades below */ ]
```

**Curated content — 10 trades, 2 templates each.** `tags: []` everywhere (margin-rule tags are
user-defined; starter tags would match nothing). Rates are USD placeholders. Fields not listed
per item default per schema (`quantity: 1`, `rate: null` if omitted, `isOptional: false`).

1. `videographer` — **Videographer**
   - "Video Production Project"
     - Pre-production: Discovery call (1 × $150) · Concept & script (1 × $600) · Storyboard (1 × $400)
     - Production: Shoot day (2 day × $800) · Kit hire (2 day × $150)
     - Post-production: Edit (10 hr × $80) · Revision rounds (2 × $200) · Color grade (1 × $300) · Music licensing (1 × $150)
     - Other: Travel (1 × $100) · Contingency (1 × $250, `isOptional: true`)
   - "Event Coverage"
     - Coverage: Full-day coverage (1 day × $1000) · Half-day coverage (1 day × $600, `isOptional: true`) · Second shooter (1 day × $400, `isOptional: true`)
     - Post-production: Highlight edit (4 hr × $80) · Full edit (8 hr × $80) · Rush delivery (1 × $200, `isOptional: true`)
2. `photographer` — **Photographer**
   - "Portrait Session": Session: Portrait session (1 × $350) · Additional hour (1 × $150, opt); Deliverables: Retouched images (10 × $25) · Print package (1 × $100, opt)
   - "Event Photography": Coverage: Event coverage (4 hr × $175) · Travel (1 × $80); Post-production: Editing & retouching (6 hr × $60) · Online gallery (1 × $50)
3. `designer` — **Graphic / Brand Designer**
   - "Brand Identity": Discovery workshop (1 × $500) · Logo concepts (3 × $400) · Refinement rounds (2 × $300) · Brand guidelines (1 × $800) · Asset pack (1 × $350) — all in one section "Brand identity"
   - "Design Retainer (Monthly)": Design support (20 hr × $75) · Priority turnaround (1 × $200, opt) — section "Monthly retainer"
4. `web-developer` — **Web Developer**
   - "Website Build": Discovery & spec (1 × $600) · Design implementation (20 hr × $90) · Development (40 hr × $95) · CMS setup (8 hr × $90) · QA & launch (8 hr × $90) · Training (2 hr × $90) — section "Website build"
   - "Maintenance Plan (Monthly)": Updates & backups (2 hr × $90) · Support hours (3 hr × $90) · Hosting (1 × $30) — section "Monthly maintenance"
5. `copywriter` — **Copywriter**
   - "Website Copy": Homepage (1 × $600) · Interior pages (4 × $300) · About page (1 × $350) · Revision rounds (2 × $150) — section "Website copy"
   - "Content Package (Monthly)": Blog posts (4 × $250) · Newsletter (1 × $200) · Social captions (8 × $25) — section "Monthly content"
6. `marketing` — **Marketing Consultant**
   - "Marketing Strategy": Marketing audit (1 × $900) · Strategy document (1 × $1200) · Channel plan (1 × $600) · Review sessions (2 × $150) — section "Strategy"
   - "Social Media Management (Monthly)": Content calendar (1 × $400) · Posts (12 × $60) · Community management (8 hr × $50) · Monthly report (1 × $200) — section "Monthly management"
7. `consultant` — **Business Consultant / Coach**
   - "Consulting Engagement": Discovery sessions (2 × $200) · Analysis (10 hr × $180) · Recommendations report (1 × $1500) · Implementation support (6 hr × $180) — section "Engagement"
   - "Advisory Retainer (Monthly)": Advisory calls (4 × $200) · Async support (1 × $300) · Quarterly review (1 × $500, opt) — section "Monthly advisory"
8. `illustrator` — **Illustrator / Motion Designer**
   - "Illustration Commission": Concept sketches (2 × $250) · Final illustrations (3 × $400) · Revision round (1 × $150) · Commercial license (1 × $300) — section "Commission"
   - "Motion Graphics": Storyboard (1 × $400) · Animation (10 hr × $85) · Sound design (1 × $250) · Revision rounds (2 × $150) — section "Motion graphics"
9. `event-planner` — **Event Planner**
   - "Full Event Planning": Planning & coordination (1 × $2500) · Vendor management (1 × $800) · Day-of coordination (10 hr × $75) · Contingency (1 × $400, opt) — section "Event planning"
   - "Day-of Coordination": Prep meetings (2 × $75) · Day-of coordination (10 hr × $75) · Assistant coordinator (1 × $300, opt) — section "Day-of"
10. `virtual-assistant` — **Virtual Assistant**
    - "VA Retainer (Monthly)": Admin support (20 hr × $35) · Inbox management (5 hr × $35) · Scheduling (3 hr × $35) — section "Monthly retainer"
    - "Project Setup": Systems audit (1 × $300) · Setup & migration (8 hr × $45) · Documentation (2 hr × $45) — section "Setup"

`unit`: use `'hr'`, `'day'`, or `'x'` (flat items) as implied above.

### NEW `src/lib/starter-templates.test.ts`

Vitest, colocated per repo convention:
- `STARTER_TRADES` has exactly 10 entries, unique `id`s, unique `label`s.
- Every trade has 1–3 templates; every template passes `StarterTemplateSchema`.
- Every template has ≥1 section, every section ≥1 item, all item rates positive when present.
- Template names unique within a trade.

### NEW `src/app/api/quote-templates/starter/route.ts`

```ts
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { openrouterChat } from '@/lib/llm/openrouter'
import { STARTER_TRADES, StarterTemplateSchema, type StarterTemplate } from '@/lib/starter-templates'
import { logger } from '@/lib/log'

const BodySchema = z.object({
  trade: z.string().optional(),
  description: z.string().trim().min(10).max(1000).optional(),
}).refine(d => !!d.trade !== !!d.description, { message: 'Provide exactly one of trade or description' })
```

Handler:
- **Trade path:** `STARTER_TRADES.find(t => t.id === body.trade)`; unknown → `badRequest('Unknown trade')`.
  `templates = trade.templates`.
- **Describe path:**
  - System prompt: "You generate starter quote templates for freelancers. Return ONLY JSON
    (no markdown, no prose): `{"templates": [...]}` — 2 or 3 templates. Each template:
    `{name, sections: [{name, items: [{description, unit, quantity, rate}]}]}`.
    `unit` is `'hr'`, `'day'` or `'x'`; `quantity` positive; `rate` a typical USD placeholder
    for the described work; 2–5 items per section, 1–3 sections per template. Do not include
    costRate/tags/isOptional."
  - User message: the description.
  - `openrouterChat([system, user], 'mistralai/mistral-small-2603')` (same model + fence-strip
    idiom as `src/app/api/llm/suggest-category/route.ts` L58-70: strip ```` ``` ```` fences, then
    extract the outermost `{...}`).
  - `JSON.parse` + `z.object({ templates: z.array(StarterTemplateSchema).min(1).max(4) }).safeParse`.
    On **any** failure: `logger.error('quote-templates-starter', ...)` + `badRequest('We couldn't
    generate templates from that description — try adding a bit more detail.')`.
- Both paths converge: `await prisma.quoteTemplate.createMany({ data: templates.map(t => ({ userId, name: t.name, sections: t.sections })) })` → `created({ count: templates.length })`.
- No dedupe vs existing templates (reruns create copies — acceptable, noted in Risks).

### NEW `src/components/projects/starter-templates.tsx`

Client component, shared by the new-quote empty state and settings.

```ts
interface Props { onCreated: (count: number) => void }
```

- Local state: `trade` (select value, `''` default), `description`, `busy`, `error`.
- UI (compact, matches `new-quote-form` idiom):
  - `<select>`: placeholder option "— choose your trade —", then `STARTER_TRADES.map` labels,
    then option `value="describe"` → **"Something else — describe my work"**.
  - `trade === 'describe'` → `<textarea rows={3}>` ("e.g. I shoot weddings and edit highlight
    films…") replacing nothing else; button label "Generate my templates".
  - Otherwise button label "Add starter templates", disabled until `trade !== ''`.
  - Submit → `POST /api/quote-templates/starter` with `{ trade }` or `{ description }`; on
    `!res.ok` show `json.error`; on success call `onCreated(json.data.count)`.
  - Busy state: `Loader2` spinner on the button; disable inputs.
- Copy above select: "Get started with ready-made templates — pick your trade, or describe
  your work and we'll generate them."
- Component fetches `STARTER_TRADES` **from the lib module directly** (it's plain data; safe to
  import into a client component — do not fetch from the API).

### MOD `src/app/api/quote-templates/route.ts`

- Import `TemplateSectionSchema` from `@/lib/starter-templates`; replace the inline
  `sections` item schema with `z.array(TemplateSectionSchema)` (same shape — no behavior change).
- GET: add `sections: true` to the `select` (needed for "N sections · M items" in settings).
  Response grows slightly; fine (user-scoped, small JSON).

### MOD `src/components/projects/save-template-modal.tsx`

Add and export a mapper for the detail page (which has numeric data, not editor strings):

```ts
export function sectionsFromQuote(
  sections: { id: string; name: string; items: {
    id: string; description: string; quantity: number; unit: string | null
    unitPrice: number; costRate: number | null; tags: string[]; isOptional: boolean
  }[] }[],
): SectionInput[] {
  return sections.map(s => ({
    id: s.id,
    name: s.name,
    items: s.items.map(i => ({
      id: i.id,
      description: i.description,
      quantity: String(i.quantity),
      unit: i.unit ?? 'x',
      unitPrice: String(i.unitPrice),
      costRate: i.costRate != null ? String(i.costRate) : '',
      tags: i.tags.join(', '),
      internalNotes: '',
      riskLevel: 'low',
      priceManual: true,
      isOptional: i.isOptional,
    })),
  }))
}
```

No other changes (its POST to `/api/quote-templates` is already correct).

### MOD `src/components/projects/quote-editor.tsx` (334 lines → keep < 400)

1. **Header "Save as template"** — import `Bookmark` from lucide + `SaveTemplateModal`.
   Button between "Ask AI" and Save:
   ```tsx
   <button onClick={() => setTemplateModalOpen(true)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent">
     <Bookmark className="w-3.5 h-3.5" /> Save as template
   </button>
   ```
   Render `<SaveTemplateModal open={templateModalOpen} onOpenChange={setTemplateModalOpen} sections={state.sections} />` at the root.
2. **ServiceItemPicker per section** — in each section's footer `<div className="px-4 py-2 border-t">`,
   next to "Add item" (wrap both in a `flex items-center gap-3`):
   ```tsx
   <ServiceItemPicker onSelect={(item) => dispatch({
     type: 'ADD_ITEM', sectionId: section.id,
     payload: {
       description: item.description,
       unit: item.unit ?? 'x',
       unitPrice: String(item.defaultRate),
       costRate: item.defaultCostRate != null ? String(item.defaultCostRate) : '',
       tags: item.tags.join(', '),
       priceManual: true,
     },
   })} />
   ```
   (Picker already fires the `/use` increment itself.)
3. **Save-to-library** — replace the no-op `onSaveToLibrary` with the hook (below); pass
   `libraryStatus` down to `QuoteLineItemsTable`.

### NEW `src/components/projects/hooks/use-save-to-library.ts`

```ts
export type LibraryStatus = 'saved' | 'duplicate' | 'error'

export function useSaveToLibrary() {
  const [statuses, setStatuses] = useState<Record<string, LibraryStatus>>({})

  const save = useCallback(async (item: ItemInput) => {
    const rate = parseFloat(item.unitPrice)
    if (!item.description.trim() || !(rate > 0)) {
      return flash(item.id, 'error')          // nothing worth saving / rate must be positive (zod)
    }
    try {
      const res = await fetch('/api/service-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: item.description.trim(),
          unit: item.unit || null,
          defaultRate: rate,
          defaultCostRate: item.costRate ? parseFloat(item.costRate) || null : null,
          tags: item.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
      flash(item.id, res.ok ? 'saved' : (res.status === 400 ? 'duplicate' : 'error'))
    } catch { flash(item.id, 'error') }
  }, [])

  // flash: set status, auto-clear after 2.5s via setTimeout
  return { save, statuses }
}
```

### MOD `src/components/projects/quote-line-items-table.tsx`

New optional prop `libraryStatus?: Record<string, LibraryStatus>`. Bookmark button renders:
- default → `Bookmark` (current behavior)
- `'saved'` → `Check` in `text-emerald-600`
- `'duplicate'` → `Bookmark` in `text-amber-500`, title "Already in library"
- `'error'` → `Bookmark` in `text-destructive`, title "Couldn't save (rate must be > 0)"

Keep the button always visible (remove the `opacity-0 group-hover` gate **only** when a status
is set, so feedback is visible without hover).

### MOD `src/components/projects/quote-detail-client.tsx`

1. Extend `QuoteLineItem` type: add `costRate: number | null` and `tags: string[]`
   (data already flows — page serializes the full quote; no query change).
2. Replace the phantom-route button handler (L375-393): `onClick={() => setTemplateModalOpen(true)}`;
   keep the same button styling/label.
3. Render `<SaveTemplateModal open={...} onOpenChange={...} sections={sectionsFromQuote(quote.sections)} />`.
4. Remove the now-dead `loading === 'save-template'` branch on that button.

### MOD `src/components/projects/new-quote-form.tsx`

1. **Empty state** — when `startMode === 'template' && templates.length === 0`, render instead
   of the hidden select:
   ```tsx
   <div className="border rounded-lg p-3 space-y-2">
     <p className="text-sm text-muted-foreground">No templates yet.</p>
     <StarterTemplates onCreated={() => router.refresh()} />
   </div>
   ```
   (Page is a server component; `router.refresh()` refetches `templates`.)
2. **Validation guard** — in `handleSubmit`, template mode with `!templateId` →
   `setError('Select a template')` + return (kills the silent blank-quote fallback).
3. Under the template select (when templates exist): `<Link href="/settings#quote-templates"
   className="text-xs text-primary hover:underline">Manage templates →</Link>`

### MOD `src/app/api/projects/[id]/quotes/route.ts`

Line 109: `title: title ?? template.name` (was: first section's name). One-line fix.

### NEW `src/components/settings/quote-templates-editor.tsx`

Mirror `service-items-editor.tsx` idioms (client fetch, `Loader2`, row hover delete):
- `useEffect` → `GET /api/quote-templates`; rows: **name** · "N sections · M items · used U×"
  (compute from `sections` JSON) · hover `Trash2` delete → `DELETE /api/quote-templates/[id]`,
  remove from local state (same pattern as `ServiceItemsEditor.handleDelete`).
- Empty state: `<StarterTemplates onCreated={refetch} />`.
- Non-empty: small "+ Add starter templates" toggle link below the list → reveals
  `<StarterTemplates onCreated={refetch} />`.
- Wrapped in the same card markup as `ServiceItemsEditor` (`rounded-lg border bg-white`,
  header label "Quote Templates").

### MOD `src/app/settings/page.tsx`

After the Service library `<Section>`:
```tsx
<Section title="Quote templates" id="quote-templates">
  <QuoteTemplatesEditor />
</Section>
```

### MOD `codebase_map.md`

Add rows following the existing table patterns: `POST /api/quote-templates/starter` route,
`QuoteTemplatesEditor`, `StarterTemplates`, `useSaveToLibrary`, and note that
`SaveTemplateModal` / `ServiceItemPicker` are now wired from `quote-editor.tsx` +
`quote-detail-client.tsx`.

---

## 4. Execution order

1. `src/lib/starter-templates.ts` (+ test) — everything else depends on the schema.
2. `POST /api/quote-templates/starter` route.
3. `starter-templates.tsx` component.
4. `quote-templates/route.ts` (schema reuse + GET sections) and the one-line title fix in
   `projects/[id]/quotes/route.ts`.
5. `save-template-modal.tsx` mapper → wire `quote-editor.tsx` (modal + picker + hook) →
   `quote-line-items-table.tsx` statuses → `quote-detail-client.tsx`.
6. `new-quote-form.tsx` empty state + guard.
7. Settings: `quote-templates-editor.tsx` + mount.
8. `codebase_map.md`.

## 5. Validation

- `pnpm run build:capabilities` (pages untouched, but confirm generated file is unchanged/clean).
- `pnpm lint && pnpm test` — new vitest file must pass.
- `DIRECT_URL="postgresql://x:x@localhost/x" pnpm build` (per CLAUDE.md gotcha).
- Manual QA script:
  1. New quote → From template → empty state → pick "Videographer" → 2 templates appear in picker.
  2. Create from template → editor opens, title = template name, sections/items populated.
  3. Editor → tweak a line → "Save as template" → name it → appears in picker + settings list.
  4. Quote detail → "Save as template" → works (was 404), keeps costRate/tags (check via settings
     item count + re-applying it).
  5. Settings → Quote templates → delete one → gone from new-quote picker.
  6. Starter describe path: "I design logos for restaurants" → 2–3 templates created.
  7. Editor → "From library" → insert an item (usageCount increments); bookmark a priced line →
     green check; bookmark it again → amber "already in library".
  8. Template mode with templates present but none selected → submit shows "Select a template",
     no blank quote created.

## 6. Risks & notes

- **Describe-path LLM failure** — handled with friendly 400; user can fall back to the 10 trades.
- **Duplicate starter runs** create duplicate template names — acceptable; delete via settings.
- **`quote-detail-client.tsx` is already 640 lines** (over the 400 cap, pre-existing). This change
  adds ~10 net (removes the fetch handler, adds modal render + state). Extracting the component
  is out of scope; don't make it materially worse.
- **Component budgets after change:** `quote-editor.tsx` ≈ 380 (<400 ✓); `new-quote-form.tsx` ≈ 230 ✓.
- **`StarterTemplates` imports lib data client-side** — pure constants + zod, no server-only deps
  (zod is already client-imported elsewhere). No bundle concern.
- **No DB migration** — models exist; if the executor hits `P2022` on `QuoteTemplate`, the fix is
  `DIRECT_URL=... pnpm db:push`, not a schema edit.
- **`AGENT_DAILY_TOKEN_CAP` / AgentUsage** — the starter route is a plain API route (like
  `suggest-category`), not an agent tool; no usage tracking added. Matches existing LLM routes.

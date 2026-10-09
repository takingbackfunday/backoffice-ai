> Superseded by PRD-agent-bank-import.md and SDD-agent-bank-import.md (browser provider is Browser Use, not Browserless).

# Agent-driven Bank Import: UX and System Architecture

Status: draft, 2026-10-08
Scope: let a user click **Import transactions → choose bank/account → confirm the date range**. A browser agent then signs in to the bank (the user completes the authentication), downloads the statement file, and passes it into the existing upload/preview/import pipeline.

---

## 0. Where we are today

There is already a first-generation bank agent:

| Piece | Location | What it does |
|---|---|---|
| Navigator | `src/lib/bank-agent/worker.ts` | Playwright over Browserless CDP. An LLM picks one action per step from an element list. Records a "playbook". |
| 2FA | `worker.ts:146-217` | Detects 2FA with a keyword scan, hands off through Browserless `liveURL`, and times out after 2 minutes. |
| Capture | `worker.ts:219` | Captures the file from a `download` event, or from a navigation to CSV text. |
| Routes | `src/app/api/bank-agent/{connect,sync}` | The whole run happens **inside one SSE HTTP request**. Credentials go in the POST body and are stored encrypted. |
| Data | `BankPlaybook`, `EncryptedCredential`, `SyncJob` (`schema.prisma:221-275`) | All of these are keyed per **Account**. |

Problems the new design has to fix:

1. **The run is tied to the HTTP request.** A Fly deploy, a machine suspend, a second machine, or the user closing the tab kills the run. Human input such as an OTP code has nowhere to go if it lands on a different machine.
2. **It forks the import pipeline.** `connect/route.ts` guesses the column mapping with regexes, imports without a review step, and skips the post-import `enqueueJob`s (rules agent, invoice matching, receipt matching). The upload path has had a lot of hardening (`analyzeCsv`, `repairRow`, reconciliation, server-side hash verification, ImportProfiles) that the agent path doesn't get.
3. **It has no date range.** The agent simply downloads whatever export the bank defaults to.
4. **It stores bank passwords.** That is a large liability:
   - The key is sha256(`ENCRYPTION_SECRET` + userId), with a hard-coded dev fallback.
   - Storing credentials breaks most banks' terms of service.
   - Under EU/UK strong customer authentication (SCA), almost every login asks for 2FA anyway, so stored passwords buy very little automation.
5. **Its safety model is prompt-only.** The username is sent into the LLM prompt (`worker.ts:336`). Nothing stops the agent from navigating to payments or transfers, or from following prompt-injected page text.
6. **Playbooks are per account**, so every user has to rediscover the same Chase navigation path.

**Core design decision:** the **user signs in themselves** inside a live view of the remote browser, and the agent only does read-only navigation and export. We never collect or store bank passwords. Because SCA makes logins interactive anyway, this costs almost nothing in automation, and it removes the biggest risk.

---

## 1. UX

### 1.1 Entry points

- **Transactions page and /upload:** an "Import transactions" split button with two options: `Upload file` (the current flow) and `Fetch from bank` (the new flow).
- **Bank accounts page:** each account row gets a `Fetch latest` action and a "Last transaction: 14 Sep · 24 days ago" hint.
- Later, a banner such as: *"Chase hasn't been updated in 30 days. Fetch now?"*

### 1.2 Flow (modal wizard, then the existing preview)

```
[1 Account] → [2 Date range] → [3 Sign in] → [4 Agent working] → [5 Review] → Done dialog
                                  ▲   │ (2FA mid-flow pops the live view back up)
                                  └───┘
```

**Step 1: Choose account**
- Show accounts grouped by institution. Each one shows:
  - its last transaction date;
  - a support badge: `Verified` (a global playbook exists and has succeeded recently), `Beta` (the agent will explore), or `Not supported` (the row deep-links to `/upload?accountId=…`).
- Allow selecting several accounts at the same bank. They share one login session and produce one file per account.
- If the institution has no `loginUrl`, ask for it once and save it on the institution.

**Step 2: Date range**
- The default is computed (see §3.4) and explained in one line:
  > *Your last Chase Checking transaction is **14 Sep 2026**. We'll fetch **11 Sep → today**. The 3-day overlap catches late-posting items, and duplicates are skipped automatically.*
- Presets: `Since last import` (default), `Last 30 / 90 days`, `This year`, `Custom`.
- If the account has no transactions, default to the last 90 days.
- If the institution has a known `maxHistoryDays` and the requested range exceeds it, warn: *"N26 only exports 90 days per file. We'll fetch it in 2 chunks."*

**Step 3: Sign in (the human step)**
- The modal widens into a two-pane layout:
  - **Left:** the embedded live view of the remote browser, already on the bank's login page.
  - **Right:** a status timeline and short guidance.
- Copy should be honest: *"You're signing in on Chase's own website, running in a secure cloud browser. Backoffice doesn't store your password. The assistant only reads and exports transactions; it is blocked from payments and transfers."*
- Sign-in completion is detected automatically (page-state classifier, §3.3). There is also an `I'm signed in` button as an override.
- 2FA paths:
  - **Push / app approval:** *"Approve the sign-in in your Chase app."* The run continues automatically.
  - **OTP field:** the user can type the code directly into the live view, or into an OTP box we render. The agent then types it in. The relay box is easier on mobile.
  - **Captcha:** the user solves it in the live view.
- Timeout: 5 minutes, with a visible countdown during the last 60 seconds.

**Step 4: Agent working**
- After sign-in the live view collapses to a thumbnail with a `Watch` toggle, so the user can leave it running.
- The timeline shows progress, e.g. `Signed in ✓ → Opening Checking ••1234 → Setting dates 11 Sep–8 Oct → Downloading CSV → Parsing (42 rows)`.
- Controls:
  - **`Take over`:** the user drives the live view themselves. We **still capture any file they download**, so the import completes even if the agent was stuck. This is the most important fallback.
  - **`Cancel`.**
  - **`Upload manually instead`:** goes to /upload with the account and date range pre-filled.
- If the agent needs the user again (another 2FA prompt, or session expiry), it:
  - re-expands the live view;
  - flashes the tab title;
  - shows a browser Notification if permission was granted.

**Step 5: Review** (reuses the existing upload preview)
- The captured file goes through `analyzeCsv → processCSV → dedup → categorize` and lands in the **same preview UI** as a manual upload:
  - counts of new rows, duplicates skipped and parse errors;
  - the reconciliation banner.
- If an `ImportProfile` matches the header signature, the mapping is applied silently. Otherwise the user sees the normal ColumnMapper with AI mapping. Both are existing behaviour.
- Rows outside the requested range are shown but unticked. Banks often export the whole statement period.
- Confirming calls the existing `/api/transactions/import`, then shows the existing Done dialog.

**Background continuation:** if the user closes the modal after signing in, the session keeps running. When the file is ready they get a toast or banner: *"Chase import ready to review (42 new)"*. Unreviewed results are kept for 24 hours.

### 1.3 UX principles

- **Never import without review** in v1. Auto-commit can come later, only for `Verified` institutions and matched profiles.
- **Every failure has a next action:** `Take over`, `Retry`, or `Upload manually` with the context pre-filled.
- **The agent never hides what it is doing.** The live view is always one click away, and the timeline shows each action in plain English.

---

## 2. System architecture

### 2.1 Components

```
┌──────────── Browser (Next.js client) ────────────┐
│ ImportWizard  ─ SSE ─►  /api/bank-import/sessions/:id/events
│ LiveViewFrame (iframe/popup to provider live URL) │
│ OtpRelay / Takeover / Cancel ─► /…/:id/input      │
└───────────────────────┬───────────────────────────┘
                        │ HTTPS (Clerk-authed)
┌───────────────────────▼───────────────────────────┐
│ Fly process group: web  (Next.js, stateless)       │
│  - creates session rows, tails events from DB,     │
│    writes user inputs, serves preview/commit       │
└───────────────────────┬───────────────────────────┘
                        │ Postgres (Neon) = coordination bus
┌───────────────────────▼───────────────────────────┐
│ Fly process group: bank-worker (same image,        │
│ `node dist/worker.js`)                             │
│  Orchestrator (state machine)                      │
│   ├─ BrowserProvider (Browserless adapter)         │
│   ├─ PageStateClassifier (LLM + heuristics)        │
│   ├─ Navigator (playbook replay → LLM fallback)    │
│   ├─ Guardrails (domain/path/action allow-lists)   │
│   └─ DownloadCapture (CDP download + PDF/CSV/XLSX) │
└───────────────────────┬───────────────────────────┘
                        │ CDP over WSS
                 Browserless (stealth Chromium, live view)
```

**Why a separate worker process:**
- A bank session lasts 2–10 minutes and spends most of that time waiting on a human.
- It must survive web deploys, the user closing the tab, and requests being load-balanced to a different web machine.
- Postgres is the only shared state, so any web machine can serve the SSE stream and accept inputs.
- Fly `[processes]` lets the worker share the Docker image. Run 1 small machine, or start it on demand via the Machines API.
- Deploys need care: the worker should drain on SIGTERM (stop claiming new sessions and let active ones finish, with a grace period of about 10 minutes), or mark them `INTERRUPTED` and offer a retry.

**Why not run browser-use (Python):** it would mean a second runtime, a second deploy and a second LLM client. The existing TypeScript loop is about 80% of what browser-use provides. If we want a framework, a TypeScript one such as Stagehand (act/observe/extract with action caching, works over any CDP endpoint) fits the stack better. Either way, put it behind the `Navigator` interface so it can be swapped.

### 2.2 Session state machine (pure, unit-tested)

```
CREATED
  → STARTING_BROWSER
  → AWAITING_LOGIN            (user acts in live view)
  → AWAITING_MFA              (optional; may loop)
  → AUTHENTICATED
  → NAVIGATING                (per account)
  → SETTING_RANGE
  → DOWNLOADING
  → PARSING
  → AWAITING_REVIEW           (browser closed here)
  → IMPORTING → COMPLETE

Any state → USER_TAKEOVER → (download captured) → PARSING
Any state → FAILED | CANCELLED | EXPIRED | INTERRUPTED
```

- Write transitions as `transition(state, event) → {state, effects[]}` in `src/lib/bank-import/state-machine.ts` with Vitest coverage. The worker executes the effects. This follows the same pure-core / I/O-wrapper split as `invoice-matching.ts`.
- **Close the browser as soon as all files are captured.** We should never keep a logged-in bank session open longer than needed.

### 2.3 Data model (proposed)

```prisma
model BankImportSession {
  id               String   @id @default(cuid())
  userId           String
  institutionId    String
  institution      InstitutionSchema @relation(fields: [institutionId], references: [id])
  accountIds       String[]
  dateFrom         DateTime @db.Date
  dateTo           DateTime @db.Date
  status           BankImportStatus @default(CREATED)
  workerId         String?            // claim owner (FOR UPDATE SKIP LOCKED)
  heartbeatAt      DateTime?          // worker liveness; stale → INTERRUPTED
  providerSession  String?            // Browserless session id (never the live URL)
  playbookId       String?
  error            String?
  expiresAt        DateTime           // hard wall-clock cap (~15 min)
  events           BankImportEvent[]
  inputs           BankImportInput[]
  artifacts        BankImportArtifact[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([userId, createdAt])
  @@index([status])
}

model BankImportEvent {            // append-only; SSE tails by seq
  id        String   @id @default(cuid())
  sessionId String
  session   BankImportSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  seq       Int
  type      String   // status | state | needs_user | artifact | error | screenshot
  payload   Json
  createdAt DateTime @default(now())
  @@unique([sessionId, seq])
}

model BankImportInput {            // web → worker mailbox
  id         String   @id @default(cuid())
  sessionId  String
  session    BankImportSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type       String   // login_done | otp | takeover | resume_agent | cancel
  value      String?  // OTP encrypted at rest; deleted on consume
  consumedAt DateTime?
  createdAt  DateTime @default(now())
}

model BankImportArtifact {         // captured files
  id          String   @id @default(cuid())
  sessionId   String
  session     BankImportSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  accountId   String
  filename    String
  mime        String   // text/csv | application/pdf | xlsx
  sha256      String
  content     Bytes    // or uploadthing key; purge after 7 days
  rowCount    Int?
  importBatchId String?
  createdAt   DateTime @default(now())
}

model InstitutionPlaybook {        // GLOBAL per bank, shared across users
  id             String   @id @default(cuid())
  institutionId  String
  version        Int
  steps          Json     // semantic steps, no user data (see §3.2)
  allowedHosts   String[]
  successCount   Int      @default(0)
  failureCount   Int      @default(0)
  lastSuccessAt  DateTime?
  status         String   @default("beta") // beta | verified | broken
  createdAt      DateTime @default(now())
  @@unique([institutionId, version])
}

enum BankImportStatus { CREATED STARTING_BROWSER AWAITING_LOGIN AWAITING_MFA AUTHENTICATED
  NAVIGATING SETTING_RANGE DOWNLOADING USER_TAKEOVER PARSING AWAITING_REVIEW IMPORTING
  COMPLETE FAILED CANCELLED EXPIRED INTERRUPTED }
```

**Additions to `InstitutionSchema`:** `loginUrl`, `allowedHosts String[]`, `agentSupport` (none | beta | verified), `maxHistoryDays Int?`, `exportFormats String[]`.

**Additions to `Account`:** `bankAccountHint String?`, e.g. the last 4 digits or the nickname the bank uses. The agent uses it to pick the right account when one login has several.

**Additions to `ImportBatch`:** `source` (upload | agent) and `bankImportSessionId`.

**Migration:**
- `SyncJob`, `BankPlaybook` and `EncryptedCredential` are superseded. Leave them in place, stop writing to them, and delete stored ciphertexts once v1 ships.
- Per CLAUDE.md, run `db:push` **before** deploying the new models.

### 2.4 API surface (all via `authedRoute`, scoped by `userId`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/bank-import/default-range?accountIds=` | Returns the computed `{from, to, lastTxnDate, overlapDays, chunks}` |
| POST | `/api/bank-import/sessions` | `{accountIds, from, to}` → `{sessionId}`. Validates ownership, same institution, `agentSupport != none`, and one active session per user. |
| GET | `/api/bank-import/sessions/:id/events?after=seq` | SSE. Polls `BankImportEvent` every ~750 ms. Resumable after reconnect via `after`/`Last-Event-ID`. |
| GET | `/api/bank-import/sessions/:id/live-view` | Mints a short-lived live URL **on demand**. Never persisted or logged. |
| POST | `/api/bank-import/sessions/:id/input` | `{type, value?}`: login_done, otp, takeover, resume_agent, cancel |
| GET | `/api/bank-import/sessions/:id/preview` | Runs the captured artifacts through the shared ingest function → `PreviewRow[]` + reconciliation |
| POST | `/api/transactions/import` | **Existing** endpoint. Add `source: 'agent'` and `bankImportSessionId`; the server marks the session COMPLETE. |

### 2.5 Shared ingest (refactor first)

Extract the body of `/api/upload` into `src/lib/import/build-preview.ts`:

```
buildPreview({ userId, accountId, text, source, filename, profile? }) → { rows, reconciliation, errors }
```

`/api/upload`, the agent preview route and any future email-forwarding import all call this one function. PDF artifacts go through `mistralOcrPdf → extractStatementRows` first, which is the same path as `/api/upload/pdf`. That route also needs a small extraction to `src/lib/import/pdf-to-csv.ts`.

The old `connect`/`sync` routes are deleted rather than patched.

---

## 3. The agent

### 3.1 Loop

```
for each step (max ~30, wall-clock capped):
  observe: url, title, a11y-tree-ish element list (existing extractPageElements),
           optional low-res screenshot for the classifier
  classify page state  → login | mfa | captcha | dashboard | account_list |
                         transactions | export_dialog | download_ready | error | unknown
  if state ∈ {login, mfa, captcha}: emit needs_user, wait for page-state change or input
  else decide action  (playbook step if it validates, else LLM)
  guardrails.check(action) → execute | reject (feed rejection back to LLM)
  record semantic step
```

Improvements over the current `worker.ts`:
- **Structured output.** Use a JSON-schema / tool-call response format instead of regex-extracting `{…}` from prose.
- **Page-state classification replaces the keyword 2FA scan.** Keep the heuristics as cheap pre-filters and let the LLM decide.
- **Date-range filling as a first-class goal.** Give the LLM `from`/`to` in ISO format and the bank's locale hint, so it formats them as the date picker expects (e.g. `11.09.2026` for German banks). Then verify by reading the input values back.
- **Format preference.** Prefer CSV, then XLSX, then PDF. Exclude pending transactions when the bank offers that option (see §3.4).
- **Model choice.** Use Haiku for classification and simple steps, and escalate to Sonnet on failure or ambiguity. Track spend through the existing `AgentUsage` daily cap.

### 3.2 Playbooks: global, semantic, self-healing

- Store **semantic** steps, not only CSS selectors. For example: `{intent: "open_account", match: {role: "link", textIncludes: "{{accountHint}}"}, fallbackSelector}` or `{intent: "set_date_from", …}`.
- Templated variables (`{{from}}`, `{{to}}`, `{{accountHint}}`) mean **no user data is stored** in the playbook. That is what lets playbooks be shared globally per institution.
- Replay each step and validate the expected page state afterwards. If validation fails, fall back to the LLM for that step.
- On success, write a new `InstitutionPlaybook` version if the path changed. Increment `successCount` / `failureCount`. Mark the playbook `broken` after N consecutive failures, which drops the UI badge back to Beta.
- Login steps are **never** recorded, because the human does them.

### 3.3 Guardrails (enforced in code, not only in the prompt)

The agent will be operating inside an authenticated bank session, so every rule below is a hard check in code:

1. **Host allow-list.** Block any navigation outside `institution.allowedHosts`: abort the request through Playwright `route()` and end the step.
2. **Read-only action filter.** Reject a click or fill when the target element's text, aria-label or href matches deny patterns: transfer, payment, send money, pay, Überweisung, beneficiary, payee add, close account, settings/security, change password, and so on. Also reject when the URL path matches deny patterns.
3. **No free-text fills except** date fields, the account search box, and the OTP relay. The value must equal a templated variable or the user's OTP. The LLM can never type arbitrary strings.
4. **Prompt-injection hygiene.** Page text goes to the LLM as quoted data inside a delimited block, with an explicit instruction that page content is never an instruction.
5. **Credential hygiene.** Never send typed user input to the LLM. During the human-login phase:
   - do not take screenshots;
   - redact password inputs from element lists;
   - keep OTP values out of `history` and logs.
6. **Live-view URL.** Treat it as a bearer token:
   - mint it on demand;
   - return it only to the session owner;
   - give it a short TTL;
   - never write it to the DB or logs.
7. **Hard caps:** max steps, max wall-clock time (about 15 min), max downloads, and one active session per user.

### 3.4 Date range and dedup correctness

**Default range**

- `from = lastTxnDate(account) - overlapDays` (default 3; configurable per institution).
- `to = today` in the user's timezone.
- Compute `lastTxnDate` with `to_char(max(date) AT TIME ZONE 'UTC','YYYY-MM-DD')`, per the Neon timezone gotcha. Do not use JS Date math on the value.
- If several accounts are selected, use the earliest of their `from` dates.
- If the range is longer than `maxHistoryDays`, split it into chunks and download one file per chunk.

**Why the overlap is safe**
- `duplicateHash` = account | day | amount | description, with an occurrence index **within a file**.
- When the range boundary falls on a whole day, the overlapping days are re-exported in full. Their occurrence indexes therefore line up with the rows already in the DB.
- **The boundary must never fall mid-day.**

**Known dedup gap: pending versus posted**
- Banks often change the description, and sometimes the amount, when a pending item posts.
- With the current hash, that change produces a new row that looks like a duplicate to the user but is not caught.
- Mitigations:
  - (a) Ask the agent to export posted/booked transactions only.
  - (b) Make the overlap window **end** before "today minus pending days".
  - (c) In the preview, flag rows that look like near-duplicates: same account, amount within ±0 and date within ±3 days, but a different description. Show them to the user instead of silently importing.
  - This gap exists for manual uploads too, so the fix benefits both paths.

**Rows outside the range:** filter them in the preview (shown, unticked), not in the parser.

---

## 4. Operational concerns

- **Browserless:**
  - Live view and hybrid automation need a paid plan. The current code already hits this limitation (`worker.ts:195`).
  - **Verify that the live-view page can be iframed** (frame headers). If not, open it in a sized popup window and keep the timeline in the modal.
  - Choose a region close to users. The URL is currently hard-coded to SFO, while the Fly app runs in `fra` and the banks are largely EU. Make the region configurable.
- **Bot detection:** some banks fingerprint aggressively. Use stealth mode, a consistent viewport and locale, and residential proxies only if needed. Some banks will stay `Not supported`; the UX is designed around that.
- **Observability:**
  - Store per-step events, and screenshots (post-login only) with 7-day retention, so broken playbooks can be debugged.
  - Track success rate per institution, broken down into time-to-login, time-to-file and LLM cost.
- **Cost:** about 15–30 LLM calls per first run, and about 2–5 per playbook replay, plus Browserless minutes. Put both into `AgentUsage`.
- **Legal/compliance:**
  - Automating a user's own session at their own request is the same model as "screen scraping with consent". It still conflicts with some banks' terms of service.
  - DOM text and screenshots containing financial data are sent to an LLM provider. This needs a privacy-policy line and a DPA check with OpenRouter and Anthropic.
  - **Strategic alternative:** in the EU/UK, PSD2 aggregators such as GoCardless Bank Account Data and TrueLayer give API access with a 90–180-day consent. Design the source as a `TransactionSource` interface (`upload | agent | aggregator`) so a bank can move to API access later without UX changes. The wizard's steps 1–2 and 5 stay identical; only step 3–4 changes.

---

## 5. Code layout

```
src/lib/bank-import/
  state-machine.ts        (+ .test.ts)  pure transitions
  default-range.ts        (+ .test.ts)  lastTxn → {from,to,chunks}
  guardrails.ts           (+ .test.ts)  host/path/element deny logic
  page-state.ts                          classifier (heuristics + LLM)
  navigator.ts                           playbook replay + LLM fallback
  playbook.ts             (+ .test.ts)  semantic step templating/matching
  capture.ts                             CDP download capture, format sniffing
  browser-provider.ts                    interface + browserless.ts adapter
  events.ts                              append/tail helpers
src/lib/import/
  build-preview.ts                       extracted from /api/upload (shared)
  pdf-to-csv.ts                          extracted from /api/upload/pdf
src/worker/
  bank-import-worker.ts                  claim loop, heartbeat, SIGTERM drain
src/app/api/bank-import/...              routes in §2.4
src/components/bank-import/
  import-wizard.tsx  account-step.tsx  range-step.tsx  live-session-step.tsx
  live-view-frame.tsx  otp-relay.tsx  session-timeline.tsx
  hooks/use-import-session.ts            SSE + reconnect + input posting
```

Each file stays under 400 lines. Step 5 reuses the existing `src/components/upload/` preview components.

---

## 6. Phasing

| Phase | Deliverable | Exit criterion |
|---|---|---|
| **0. Refactor** | Extract `buildPreview` / `pdfToCsv`. Add the worker process group and the session/event/input tables. Write the state machine and `default-range` with tests. | `/api/upload` behaves identically (existing tests pass) |
| **1. Attended MVP** | Wizard steps 1–5. Human login in the live view. LLM navigation with date range. Takeover capture. Review through the shared preview. Guardrails. 2–3 target banks. | 3 banks at ≥80% end-to-end success; zero guardrail escapes in red-team tests |
| **2. Learning** | Global semantic playbooks, Verified/Beta badges, multiple accounts per login, chunked ranges, near-duplicate flagging | Median time from login to review ≤ 60 s on Verified banks |
| **3. Retire legacy** | Delete `bank-agent/{connect,sync}`, `EncryptedCredential` data and `SyncJob` | No stored bank credentials anywhere |
| **4. Optional** | A `TransactionSource` aggregator adapter for EU banks; auto-commit for Verified banks with matched profiles; "stale account" nudges | Product decision |

---

## 7. Open questions

1. Which 2–3 banks are the MVP targets? This decides the Browserless region, locale handling and the first playbooks.
2. Is a paid Browserless plan (live view) acceptable, or should we evaluate Browserbase or self-hosted Chromium on Fly with a noVNC-style live view?
3. Should the worker run 1 always-on machine, or start on demand? Starting on demand adds a cold start of roughly 5–10 s before the login page appears.
4. Should raw artifacts be kept for 7 days, which helps debugging and re-parsing, or deleted immediately after import?
5. Should aggregator APIs be pursued in parallel for EU banks? That would mostly replace scraping for N26, ING, Deutsche Bank and others.

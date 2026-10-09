# PRD: Agent-driven Bank Import (Chase + N26)

| | |
|---|---|
| Status | Approved for build |
| Date | 2026-10-08 |
| Owner | Samuel |
| Implementation spec | `docs/bank-import/SDD-agent-bank-import.md` |
| Background / exploration | `docs/bank-import/architecture.md` (superseded where it conflicts with this PRD) |

## 1. Problem

To keep their books current, users must log in to their bank, find the export screen, pick dates, download a CSV and then upload it to Backoffice. They repeat this every few weeks for every account. It is tedious, it gets skipped, and the books fall out of date.

The current "Manual Sync" (`/bank-sync`, `src/lib/bank-agent/*`) tried to automate this and failed in several ways:
- It stores bank passwords.
- It runs inside a single HTTP request, so it dies on deploys and closed tabs.
- It bypasses the hardened upload pipeline.
- It has no date range.
- It has no code-enforced safety.

## 2. Goal

From inside Backoffice, the user clicks **Fetch from bank**, picks the account and confirms the date range. They sign in to their bank themselves in an embedded live browser. On the first successful run, the AI agent finds the export screen and saves a reusable, user-specific route for that bank. On later runs it reuses that route after the user signs in. The CSV lands in the **existing** review screen, and the user confirms the import.

## 3. Scope

**In scope (v1)**
- Banks: **Chase** (US: checking + credit card) and **N26** (EU).
- Browser provider: **Browser Use Cloud: Browser Infrastructure API** (cloud Chromium over CDP, live view, residential proxies, profiles, downloads API).
- Navigation: our own TypeScript agent (Playwright over CDP + OpenRouter LLM), with guardrails enforced in code.
- Learn and save a semantic export flow per user and bank after the agent successfully captures a CSV; replay it on later runs, with live-page validation and LLM fallback if the bank UI changes.
- Human-in-the-loop sign-in and 2FA through the embedded live view.
- A take-over fallback: if the agent gets stuck, the user drives the browser, and any file they download is still captured.
- Handoff to the existing `/upload` map → preview → import flow.
- An on-demand worker with cold-start UX.
- Removal of the legacy Manual Sync feature.

**Out of scope (v1)**
- Open-banking aggregator APIs. These need a licensed business entity, which we don't have.
- Scheduled or unattended syncs. Every run is attended because SCA/2FA makes logins interactive.
- Storing bank usernames or passwords. **Never.**
- Banks other than Chase and N26.
- Several accounts in one session (one account per session).
- PDF statements from the agent path. CSV is required. A captured PDF can be downloaded from the session and uploaded manually.
- Filtering rows outside the requested date range. Dedup already handles the overlap.
- Mobile-optimised live view. It works but isn't tuned.

## 4. Users and context

- **Freelancer / small landlord** with one or two bank accounts, importing every 2–6 weeks. Usually on a desktop.
- **Chase user:** US-based. Chase 2FA is an SMS/phone code or Chase-app approval, mainly on unrecognised devices.
- **N26 user:** EU-based. Every web login asks for approval in the N26 app.

## 5. User experience

### 5.1 Entry points
1. **`/upload`:** a "Fetch from bank" button above the dropzone. It is shown only when the feature flag is on and the user has at least one Chase or N26 account.
2. **`/bank-accounts`:** a "Fetch latest" button on each Chase or N26 account row. This opens the same dialog with the account preselected.
3. **Resume banner on `/upload`:** shows when the user has an in-progress session ("Chase import in progress — Open") or a captured-but-unreviewed one ("Your Chase download is ready — Review").

### 5.2 Flow (one dialog, three steps, then the existing upload review)

**Step 1: Account**
- Lists supported accounts as bank name + account name + "Last transaction: 14 Sep 2026".
- Chase only: an optional field, *"Last 4 digits as shown on Chase (helps if you have several Chase accounts)"*. It is pre-filled if saved before.

**Step 2: Date range**
- Default range: last transaction date minus 3 days, up to today. With no history: the last 90 days.
- One explanatory line: *"Your last transaction is 14 Sep 2026. We'll fetch 11 Sep → today. The 3-day overlap catches late-posting items; duplicates are skipped automatically."*
- Presets: Since last import (default), Last 30 days, Last 90 days, Custom.
- Checkbox (default on): **"Remember this browser for faster sign-in."** Helper text: *"Keeps the bank's 'trusted device' cookie in our secure cloud browser so you're asked for codes less often. Your password is never stored. You can forget it at any time."*
- Separately, after the agent's first successful CSV capture, Backoffice remembers the export route for this user and bank. This is independent of the browser checkbox: every run still requires the user to sign in, and no login steps or credentials are saved.
- Primary button: **Start**.

**Step 3: Live session**
The dialog widens. The header shows the status title and body (§5.3). The main area shows the live browser once available, otherwise a status card with a spinner and elapsed time. A timeline lists events in plain English.

| State | What the user sees | Controls |
|---|---|---|
| Waking up (cold start) | "Waking up the import service… The first run can take up to 30 seconds." After 30 s: "Still starting…". After 90 s: the error state. | Cancel |
| Starting browser | "Starting a secure browser…" | Cancel |
| Sign in | Interactive live view of the bank's login page. "Sign in to Chase in the window below. We never see or store your password." | **I've signed in**, Cancel |
| 2FA | "Approve the sign-in in your N26 app" / "Enter the code Chase sent you in the window below." | **I've signed in**, Cancel |
| Agent working | The live view becomes watch-only (dimmed, not clickable). Timeline: "Opened Checking ••1234", "Set dates 09/11/2026 – 10/08/2026", "Downloading CSV…" | **Take over**, Cancel |
| Needs you (stuck / taken over) | The live view is interactive. "The assistant got stuck. Please download the CSV yourself: we'll pick it up automatically." | **Let the assistant continue**, **Upload manually instead**, Cancel |
| Captured | "Got it: 1 file downloaded. Opening review…" Navigates automatically to `/upload?bankImport=<id>`. | Review now |
| Failed / expired / cancelled | A short reason and next step. | **Try again**, **Upload manually instead** |

If the tab is hidden when the user is needed (sign-in, 2FA, stuck), the tab title flashes "(!) Action needed — Backoffice". A browser notification is shown if permission was granted at Start.

On the first run, the timeline says **"Learning this bank's export flow"** while the agent finds the CSV export. After the agent captures a CSV, that semantic route is saved for this user and bank. On later runs, the timeline says **"Using your saved export flow"** after sign-in. The route is revalidated against the live page at each step; if it no longer matches, the agent falls back to normal navigation and refreshes the saved route only after it successfully captures a CSV. A user-only takeover does not train or replace the route.

The user can close the dialog at any time. The session keeps running, and the resume banner brings them back.

**Review (existing screen):** `/upload?bankImport=<id>` loads the captured CSV into the upload store with the account preselected. The existing flow then runs: saved-profile lookup, column mapping, AI mapping check, preview with duplicates and reconciliation, then import. When the import succeeds, the session is marked complete.

### 5.3 Copy principles
- Be honest about what happens: the user signs in on the bank's own site, the password is not stored, and the assistant is read-only.
- Every failure states what happened and offers **Try again** and **Upload manually instead**.

## 6. Functional requirements

| ID | Requirement |
|---|---|
| R1 | Supported banks are identified from the account's institution name: `^chase\b` → Chase, `^n26\b` → N26 (case-insensitive). This covers the global seeds ("Chase Checking", "Chase Credit Card", "N26") and custom "Chase" institutions. |
| R2 | The default range follows §5.2. Dates are calendar dates (`YYYY-MM-DD`) using the **user's local today**, which the client sends. Ranges are validated: start ≤ end, end ≤ today, at most 731 days. |
| R3 | A user can have only **one active session** (not terminal and not captured). Starting another returns the existing session. |
| R4 | Sessions run in a separate **worker** process, not in a web request. Closing the tab, reloading or deploying the web app does not affect a running session. |
| R5 | The worker is **on-demand**. It is woken when a session is created and exits after 10 minutes idle. The UI shows cold-start progress (§5.2). |
| R6 | Chase browsers run in Browser Use **US** with a **US** residential proxy. N26 browsers run in Browser Use **EU (Frankfurt)** with a **DE** proxy. |
| R7 | Sign-in is completed by the human in the live view. The system never receives, types or stores bank credentials. |
| R8 | Sign-in completion is detected automatically (heuristics: visible logout control, no password field, bank URL patterns) or confirmed with the **I've signed in** button. |
| R9 | The agent only clicks, selects options, scrolls, waits and fills **date fields with system-computed values**. It can never type arbitrary text. |
| R10 | Guardrails are enforced **in code**: (a) block clicks on payment, transfer, settings, security, logout, delete and invest elements (English and German); (b) after every action, if the page is on a non-allowed host or a denied path, go back and count a violation, and after 2 violations hand over to the user. Page text is treated as untrusted data in the LLM prompt. |
| R11 | Any file downloaded in the browser, by the agent or the user, is captured. The first CSV-like file ends navigation. Files over 20 MB are ignored. |
| R12 | After capture the agent attempts to sign out (best effort, 20 s). The cloud browser is then **stopped**. The live-view URL is erased. |
| R13 | Captured files are kept for 7 days and then purged. An unreviewed captured session expires after 24 hours. |
| R14 | Time limits: sign-in 5 min, each "needs you" wait 5 min, whole session 20 min, unclaimed in queue 3 min. |
| R15 | LLM usage is recorded in `AgentUsage` (endpoint `bank-import`). Sessions cannot start if the user's daily AI budget is exhausted. |
| R16 | "Remember this browser" uses one Browser Use profile per (user, bank). The user can forget it from the bank accounts page, which deletes the profile. |
| R17 | The feature is behind `BANK_IMPORT_ENABLED=1`. When it's off, there are no buttons and the APIs return 404. If `BANK_IMPORT_ENABLED_USER_IDS` is non-empty, only those Clerk user IDs can see or call the feature; an empty/unset list allows all users. |
| R18 | The legacy Manual Sync feature (routes, page, tab, `src/lib/bank-agent`) is removed. The legacy DB tables stay but nothing writes to them. |
| R19 | The live-view URL is treated as a credential. It is encrypted at rest, returned only to the session owner while the browser is live, and never logged. |
| R20 | Session recording (video) is disabled except for user IDs listed in `BANK_IMPORT_RECORD_USER_IDS`, which is used for calibration only. |
| R21 | After the agent successfully navigates the export flow and captures a CSV, save a semantic flow scoped to `(userId, bankKey)` and reuse it after sign-in on later runs. It uses dynamic account/date values and contains no credentials, login steps, cookies, raw page text, or account-specific labels. A user-only takeover does not train or replace the flow. |
| R22 | Every run requires the user to authenticate on the bank's site. A saved export flow starts only after authentication is detected or confirmed; it never automates or stores sign-in information. |
| R23 | Revalidate each saved step against the current live page and enforce all existing guardrails. If a step is missing, ambiguous, or unsafe, stop replay and fall back to LLM navigation. Replace the saved flow only after the agent completes navigation and captures a CSV successfully. |
| R24 | The user can delete their saved export flow for a bank from the bank accounts page. This is separate from forgetting the trusted-device browser profile. |
| R25 | Every session produces a correlated, structured trace across queueing, worker startup, browser setup, authentication, each navigation/replay action, model calls, guardrails, downloads, cleanup, and the terminal result. Trace records include timestamps, durations, stable event names, outcomes, retry counts, and safe diagnostic metadata. |
| R26 | The session owner can inspect and download a JSON diagnostics bundle, including after failure. Trace data is retained for 30 days and is owner-scoped. |
| R27 | Traces and production logs never contain credentials, OTPs, live-view or download URLs, API keys, raw bank-page text/labels, full paths/query strings, account names/numbers, transaction data, or raw download filenames. Use route classes, semantic action intents, normalized error codes, and file type/size instead. |

## 7. Non-functional requirements
- **Security:** no credential storage. Owner-only access to every session endpoint. No bank page text, credentials or live URLs in logs.
- **Privacy:** the page element list (text and labels) is sent to the LLM via OpenRouter, and long digit sequences are redacted first. Add a line to the privacy policy: "When you use Fetch from bank, the screen content of your bank's export pages is processed by our AI provider to operate the browser."
- **Production QA:** structured tracing is enabled for every session; browser video is not required for troubleshooting and remains disabled except for the explicitly listed calibration users.
- **Cost per session (target):** under $0.50, covering Browser Use browser time (~$0.02/h), residential proxy data and about 25 LLM calls at most.
- **Codebase rules (`CLAUDE.md`):** components ≤ 400 lines, `authedRoute` for JSON routes, quoted identifiers in raw SQL, no nested forms.

## 8. Success metrics (measured after calibration, §14 of the SDD)
- End-to-end success (session reaches captured with a CSV) is **≥ 70%** for Chase and for N26 across the first 20 real sessions.
- Median time from sign-in to captured is **≤ 90 s**.
- **0** guardrail-blocked actions executed (blocked actions are logged as `warning` events).
- **0** stored bank credentials.
- Every terminal session has a downloadable trace with a terminal outcome and timings for each major phase.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Banks detect the automation | Browser Use stealth Chromium + residential proxy in the bank's country + persistent profile. The user does the login, so login is human-shaped. |
| The bank UI changes and the agent gets lost | Revalidate saved semantic steps against the live page, fall back to LLM navigation on mismatch, and offer take-over if needed. |
| The agent clicks something harmful | Code-level deny-lists, URL checks after each action, a read-only action set, and no free text. |
| Live-view URL leak | Encrypted at rest, owner-only, short-lived (browser stopped at the end). |
| Pending → posted description changes create near-duplicates | Known limitation (it affects manual uploads too). Out of scope for v1. |
| N26/Chase export screens differ from our assumptions | Hints are marked UNVERIFIED and calibrated by Samuel with real accounts (SDD §14) before the flag is enabled for anyone else. |

## 10. Rollout
1. Build behind the flag (off in production).
2. Run the local fake-bank E2E (SDD Task 6).
3. Deploy the worker and enable the flag for Samuel's account only. Calibrate Chase and N26 (SDD §14).
4. Enable for all users. Remove Manual Sync in the same release.

## 11. Decisions log
- **Browser Use rather than Browserless.** Browser Use offers a residential proxy per country by default, an EU (Frankfurt) region, per-user profiles, a downloads API that captures user-initiated downloads too, an embeddable live view, and $0.02/h browsers. Browserless's advantage (server-enforced view-only live URLs) isn't needed.
- **Browser Use's browser infrastructure rather than its hosted agent (V4 runs).** Inside a logged-in bank session we need guardrails enforced in code and control over what reaches the LLM. A hosted agent can only be steered by prompt. We may revisit with a hosted-agent `Navigator` adapter later.
- **Human sign-in rather than stored credentials.** SCA makes logins interactive anyway, and storing credentials is a liability.
- **Reuse `/upload` for review** rather than building a new preview, so the agent path gets all the parsing hardening and saved import profiles.

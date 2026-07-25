# PRD-03 — Saved Import Profiles & Multi-File Upload

Status: Draft · Owner: Staff Eng · Date: 2026-07-24 · Priority: P2 · SDD: `sdd-03-import-profiles-multifile.md`

## Problem

Importing bank statements is a recurring chore, and the app treats every upload
as the first one:

1. **No memory.** A user importing the same bank's CSV every month re-confirms the
   same column mapping every time. The deterministic guesser and the LLM
   validation call run unconditionally, even though the user already told us the
   answer last month. (Verified: no confirmed mapping is persisted anywhere —
   `InstitutionSchema.csvMapping` is write-once-placeholder and never read at
   upload; `ImportBatch` stores no mapping; `UserPreference` has no import keys.)
2. **One file at a time.** The dropzone takes `files[0]` only. A user with three
   monthly statements from the same bank must run the full wizard three times.

## Goals

- Repeat uploads of a previously-seen format skip detection entirely: the saved
  mapping (and last-used account) are pre-applied, with one clear confirmation.
- Users can drop multiple files in one session when they share the same format;
  mismatched files are rejected with a clear explanation.
- First-time formats keep today's deterministic + LLM-assisted mapping flow.

## Non-goals

- Cross-account multi-file import (all files in one session go to one account;
  same-bank requirement makes cross-account rare).
- Reviving `InstitutionSchema` as a per-user mapping store (it's a global
  template catalog for account creation — see SDD for the decision).
- PDF bank detection from statement content (PDFs converge to a fixed synthesized
  CSV schema; there is no column mapping to remember).
- Changes to dedup semantics (`duplicateHash` already handles overlapping
  statements across files).

## User stories

- As a monthly CSV importer, when I drop this month's statement, the app says
  "Looks like your Chase checking export — using your saved mapping" and takes me
  straight to a pre-filled preview.
- As a user, I can drop three statement PDFs from the same bank at once and
  import them together into one account.
- As a user, if I accidentally include a different bank's file in the batch, the
  app refuses just that file and tells me why.
- As a user, if my bank changes its export format, I can remap once and the new
  format is remembered alongside the old one.

## Requirements

### R1 — Import profiles (item #11)

- Persist a per-user **import profile** keyed by a header signature (normalized
  hash of the file's column headers), storing: the confirmed mapping
  (`CsvMapping`), the raw headers, the last-used account, a use count, and
  timestamps. Multiple profiles per user (one per distinct format).
- On file drop: compute the signature; if a profile exists, pre-apply its mapping
  and pre-select its last-used account, show a dismissible "saved mapping" banner,
  and **skip the LLM validation call** (deterministic guess is bypassed too).
- The user can always adjust the mapping; on successful import the profile is
  updated (upsert: refresh mapping, account, `lastUsedAt`, `useCount + 1`).
- A "Re-detect columns" affordance discards the profile suggestion for this
  session and runs today's deterministic + LLM flow.
- PDF uploads: the synthesized CSV headers are fixed by design, so profile lookup
  is trivial; the win is skipping the (always-redundant) LLM validation call and
  pre-selecting the last account.

### R2 — Multi-file upload (item #12)

- Dropzone accepts multiple files (drag-drop and file picker, `multiple`).
- All files in a session must share one header signature **and** map to the
  session's single account:
  - CSVs: identical normalized headers required.
  - PDFs: always compatible with each other (fixed synthesized schema).
  - Mixing CSV + PDF in one session: allowed only if the CSV's headers equal the
    PDF synthesized schema (rare; otherwise reject with explanation).
- Non-conforming files are rejected individually with a per-file error
  ("statement-jan.csv has different columns — upload it separately").
- The session shows a file list (name, row count, status) with per-file removal.
- One shared mapping applies to all files (identical format premise).
- Preview aggregates rows across files (per-file row counts + total) and dedup
  indicators; import creates **one `ImportBatch` per file** (preserves today's
  per-file audit trail; no schema change to `ImportBatch`).
- Cap: 10 files per session (guardrail against accidental 200-file drops).

### R3 — Interaction between R1 and R2

- Signature check happens per file as it's added; the session signature is set by
  the first file. Profile lookup happens once per session (on first file).
- If the session signature matches a saved profile, all files use it.

## Success metrics

- Repeat-format upload → preview visible with zero LLM calls (verify via network
  tab / logs: no `POST /api/llm/validate-mapping`).
- Multi-file import of N same-bank files produces N `ImportBatch` rows and the
  same dedup behavior as N sequential single-file imports (row counts match).
- Mixed-format drop → clear per-file rejection, no partial import.

## Alternatives considered

- **Store profiles in `UserPreference.data`** (`importProfiles: Record<sig, mapping>`).
  Zero migration, but unbounded growth in a JSON blob, no timestamps/queries, and
  bloats every preferences read. Rejected in favor of a Prisma model.
- **Write confirmed mappings back to `InstitutionSchema.csvMapping`.** Rejected:
  the table is global/shared (per-user rows exist but are created with placeholder
  mappings and are never read during upload), and one institution can have several
  export formats (seed already splits "Chase Credit Card" vs "Chase Checking").
  Header signature is the robust key.
- **Per-file account selection.** Rejected: "same bank" premise makes it rare;
  single session account keeps the wizard at today's complexity.
- **One ImportBatch with `filenames: String[]`.** Rejected: schema change for no
  benefit over N batches; per-file batches preserve existing audit semantics.

## Open questions

- Should profiles be visible/manageable anywhere (e.g. a "Saved import formats"
  list in Settings with delete)? Lean: phase 2; profiles self-maintain via
  upsert, and stale ones are harmless.
- Should the profile store the original filename pattern to auto-suggest the
  account even when the user has several accounts at the same bank? Lean: no —
  last-used account is good enough.

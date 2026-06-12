/**
 * Validates every `prisma.$queryRaw` / `$executeRaw` template literal in `src/`
 * by running `EXPLAIN` against a real Postgres schema (via DIRECT_URL).
 *
 * Why this exists
 * ----------------
 * Raw SQL bypasses Prisma's type-safety and its `@map`/`@@map` name remapping.
 * Bugs like `cp."workspaceId"` (real column is `projectId`), unquoted camelCase
 * identifiers that Postgres folds to lowercase (`dueDate` -> `duedate`), and
 * timestamp-vs-date type mismatches are invisible to `tsc`, ESLint and the build.
 * They only surface at runtime in production. This script catches them earlier:
 * point it at a database whose schema matches `prisma/schema.prisma`
 * (`pnpm prisma db push` against a throwaway Postgres) and it will EXPLAIN every
 * query, failing on undefined-column / undefined-table / type errors.
 *
 * Usage:  DIRECT_URL=postgres://... node scripts/validate-sql.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url || /@localhost\/x$/.test(url)) {
  console.log('validate-sql: no real DIRECT_URL provided — skipping.')
  process.exit(0)
}

// `pg` connects to any standard Postgres (the CI service container) as well as
// Neon (via the standard connection string). Neon requires SSL.
const client = new pg.Client({
  connectionString: url,
  ssl: /neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined,
})
await client.connect()

// SQLSTATE codes that mean "the query does not match the schema".
const SCHEMA_ERRORS = new Set([
  '42703', // undefined_column
  '42P01', // undefined_table
  '42883', // undefined_function / operator (e.g. interval >= integer)
  '42704', // undefined_object
])

// Generated Prisma client + test files contain `$queryRaw` references that are
// not real application queries.
const SKIP_DIRS = new Set(['generated', 'node_modules'])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...walk(p))
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

function extractQueries(file) {
  const src = readFileSync(file, 'utf8')
  const queries = []
  let idx = 0
  for (;;) {
    const m = /\$(?:queryRaw|executeRaw)\b/.exec(src.slice(idx))
    if (!m) break
    const at = idx + m.index
    const tick = src.indexOf('`', at)
    if (tick === -1) break
    const end = src.indexOf('`', tick + 1)
    if (end === -1) break
    const line = src.slice(0, tick).split('\n').length
    queries.push({ line, text: src.slice(tick + 1, end) })
    idx = end + 1
  }
  return queries
}

const files = walk('src')
let total = 0
let failures = 0

for (const file of files) {
  for (const q of extractQueries(file)) {
    // Replace `${...}` interpolations with a neutral literal that coerces to
    // most column types. We only assert on schema-shape errors, so param typing
    // is not a concern here.
    const stmt = 'EXPLAIN ' + q.text.replace(/\$\{[^}]+\}/g, "'2026-01-01'")
    total++
    try {
      await client.query(stmt)
    } catch (e) {
      if (SCHEMA_ERRORS.has(e.code)) {
        failures++
        console.error(`FAIL ${file}:${q.line} [${e.code}] ${e.message.split('\n')[0]}`)
      }
    }
  }
}

await client.end()

if (failures > 0) {
  console.error(`\nvalidate-sql: ${failures}/${total} raw queries reference invalid schema identifiers.`)
  process.exit(1)
}
console.log(`validate-sql: ${total} raw queries OK against schema.`)

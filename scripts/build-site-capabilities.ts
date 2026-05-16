#!/usr/bin/env tsx
/**
 * Generates src/lib/agent/site-capabilities.generated.ts from page.capabilities.ts sidecars.
 *
 * Usage:
 *   pnpm run build:capabilities          — generate, warn on missing sidecars
 *   pnpm run build:capabilities --check  — exit non-zero if any active page.tsx lacks a sidecar
 */

import { readdirSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const APP_DIR = join(ROOT, 'src/app')
const OUT_FILE = join(ROOT, 'src/lib/agent/site-capabilities.generated.ts')
const CHECK_MODE = process.argv.includes('--check')

// Relative-from-app-dir patterns for pages we intentionally skip
const SKIP_PATTERNS: RegExp[] = [
  /^\(public\)\//,         // public rental-app / doc-upload / lease-sign pages
  /^sign-in\//,
  /^sign-up\//,
  /^portal\//,             // tenant portal (separate auth)
  /^connect\/callback\//,  // OAuth redirect — no UI
  /^page\.tsx$/,           // root `/` redirect
]

function shouldSkip(relFromApp: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(relFromApp))
}

function walk(dir: string, test: (name: string) => boolean): string[] {
  const results: string[] = []
  try {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) results.push(...walk(full, test))
      else if (test(ent.name)) results.push(full)
    }
  } catch { /* skip inaccessible */ }
  return results
}

async function main() {
  const capFiles = walk(APP_DIR, n => n === 'page.capabilities.ts')
  const pageFiles = walk(APP_DIR, n => n === 'page.tsx')

  // Load and validate capabilities
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capabilities: any[] = []
  for (const f of capFiles) {
    try {
      const mod = await import(pathToFileURL(f).href)
      const cap = mod.capability
      if (!cap?.route || !cap?.title) {
        console.warn(`[caps] WARNING: invalid or missing capability export in ${relative(ROOT, f)}`)
        continue
      }
      capabilities.push(cap)
    } catch (e) {
      console.warn(`[caps] WARNING: could not import ${relative(ROOT, f)}: ${e}`)
    }
  }

  // Find pages missing sidecars
  const missing: string[] = []
  for (const pf of pageFiles) {
    const relFromApp = relative(APP_DIR, pf)
    if (shouldSkip(relFromApp)) continue
    const expectedCap = pf.replace(/page\.tsx$/, 'page.capabilities.ts')
    if (!capFiles.includes(expectedCap)) {
      missing.push(relative(ROOT, pf))
    }
  }

  if (missing.length > 0) {
    const msg = `[caps] ${missing.length} page(s) missing capability sidecars:\n${missing.map(m => `  - ${m}`).join('\n')}`
    if (CHECK_MODE) {
      console.error(msg)
      process.exit(1)
    } else {
      console.warn(msg)
    }
  }

  // Build keyword index: word → [capability indices]
  const index: Record<string, number[]> = {}
  capabilities.forEach((cap, i) => {
    const text = [cap.title, cap.purpose, ...(cap.jobsToBeDone ?? []), cap.route].join(' ')
    const words = new Set(text.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3))
    for (const w of words) {
      if (!index[w]) index[w] = []
      index[w].push(i)
    }
  })

  const output = `// AUTO-GENERATED — do not edit by hand. Run: pnpm run build:capabilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _data: any[] = ${JSON.stringify(capabilities, null, 2)}
export { _data as SITE_CAPABILITIES }
export const SITE_CAPABILITY_INDEX: Record<string, number[]> = ${JSON.stringify(index, null, 2)}
`

  writeFileSync(OUT_FILE, output, 'utf-8')
  console.log(`[caps] Written ${capabilities.length} capabilities → ${relative(ROOT, OUT_FILE)}`)
  if (missing.length > 0) {
    console.log(`[caps] ${missing.length} sidecar(s) still missing — add them to complete the index.`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

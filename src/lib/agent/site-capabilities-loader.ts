import { SITE_CAPABILITIES, SITE_CAPABILITY_INDEX } from './site-capabilities.generated'
import type { PageCapability } from './site-capabilities-types'

// Cache compiled regexes — built once per process
const regexCache = new Map<string, RegExp>()

function getRegex(template: string): RegExp {
  if (!regexCache.has(template)) {
    const pattern = template
      .replace(/\//g, '\\/')
      .replace(/\[([^\]]+)\]/g, '[^/]+')
    regexCache.set(template, new RegExp(`^${pattern}$`))
  }
  return regexCache.get(template)!
}

export function findCapability(pathname: string): PageCapability | null {
  const normalized = (pathname.split('?')[0].replace(/\/$/, '')) || '/'

  const matches = (SITE_CAPABILITIES as PageCapability[]).filter(
    cap => !cap.hidden && getRegex(cap.route).test(normalized)
  )
  if (!matches.length) return null

  // Most specific = fewest dynamic segments (most fixed path parts)
  matches.sort((a, b) => {
    const fixed = (r: string) => r.split('/').filter(s => !s.startsWith('[')).length
    return fixed(b.route) - fixed(a.route)
  })

  return matches[0]
}

export function searchCapabilities(query: string, limit = 5): PageCapability[] {
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2)
  if (!words.length) return (SITE_CAPABILITIES as PageCapability[]).slice(0, limit)

  const scores = new Map<number, number>()
  const index = SITE_CAPABILITY_INDEX

  for (const word of words) {
    // Exact index hit
    const exact = index[word]
    if (exact) for (const i of exact) scores.set(i, (scores.get(i) ?? 0) + 2)

    // Prefix/substring match in index keys (O(keys) per word — negligible at 60 entries)
    for (const [key, idxs] of Object.entries(index)) {
      if (key !== word && (key.includes(word) || word.includes(key))) {
        for (const i of idxs) scores.set(i, (scores.get(i) ?? 0) + 1)
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i]) => (SITE_CAPABILITIES as PageCapability[])[i])
    .filter(Boolean)
}

export function capabilityIndexSummary(): string {
  const BUDGET = 4000
  const lines: string[] = []
  let len = 0

  for (const cap of SITE_CAPABILITIES as PageCapability[]) {
    if (cap.hidden) continue
    const line = `- ${cap.route} — ${cap.title}: ${cap.purpose}`
    if (len + line.length + 1 > BUDGET) break
    lines.push(line)
    len += line.length + 1
  }

  return lines.join('\n')
}

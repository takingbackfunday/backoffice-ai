/**
 * Flags rows whose hash already appeared earlier in the same upload session
 * (e.g. two overlapping statement exports). The first occurrence is not a
 * duplicate; later ones are.
 */
export function markSessionDuplicates(hashes: string[]): boolean[] {
  const seen = new Set<string>()
  return hashes.map((h) => {
    if (seen.has(h)) return true
    seen.add(h)
    return false
  })
}

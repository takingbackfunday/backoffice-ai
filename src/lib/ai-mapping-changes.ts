import type { CsvMapping } from '@/lib/csv-processor'

export const AI_AUTO_APPLY_THRESHOLD = 99
export type AiMappedField = 'dateCol' | 'amountCol' | 'descCol' | 'notesCol'
export interface AiMappingChange { field: AiMappedField; from: string | undefined; to: string }

/** Fields the AI should auto-apply, excluding user edits, unknown columns, and no-op changes. */
export function computeAiMappingChanges(
  mapping: Partial<CsvMapping>,
  ai: Partial<Record<AiMappedField, { col: string | null; confidence: number }>>,
  touched: ReadonlySet<string>,
  headers: string[],
): AiMappingChange[] {
  const changes: AiMappingChange[] = []
  for (const field of ['dateCol', 'amountCol', 'descCol', 'notesCol'] as const) {
    const suggestion = ai[field]
    if (!suggestion?.col || suggestion.confidence < AI_AUTO_APPLY_THRESHOLD) continue
    if (!headers.includes(suggestion.col) || touched.has(field)) continue
    if (field === 'amountCol' && mapping.amountMode === 'split') continue
    if (mapping[field] === suggestion.col) continue
    changes.push({ field, from: mapping[field], to: suggestion.col })
  }
  return changes
}

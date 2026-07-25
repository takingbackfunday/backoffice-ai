import { createHash } from 'crypto'

/**
 * Compute a stable signature from CSV column headers.
 *
 * Normalization: trim + lowercase each header, then sort alphabetically so
 * the signature is column-order independent (mapping is by column name, not
 * position). CSV re-exports from the same bank months later hash identically.
 *
 * PDFs all converge to the same fixed synthesized schema (`STATEMENT_CSV_HEADERS`),
 * so every PDF upload hashes to one deterministic signature.
 */
export function headerSignature(headers: string[]): string {
  const normalized = headers.map((h) => h.trim().toLowerCase()).sort()
  return createHash('sha256').update(normalized.join('\n')).digest('hex')
}

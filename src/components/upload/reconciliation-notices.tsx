export interface ReconciliationMeta {
  filename: string
  expectedCredits: number | null
  expectedDebits: number | null
  actualCredits: number
  actualDebits: number
  creditsMatch: boolean | null
  debitsMatch: boolean | null
  matched: boolean
}

export function ReconciliationNotices({ items, variant = 'inline' }: { items: ReconciliationMeta[]; variant?: 'inline' | 'banner' }) {
  if (items.length === 0) return null
  if (variant === 'banner') {
    return (
      <div className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
        {items.map((r) => (
          <p key={r.filename} data-testid="reconciliation-mismatch">
            ⚠ Parsed totals differ from the statement summary
            {r.expectedCredits != null && r.creditsMatch === false && (
              <> (credits: expected {r.expectedCredits.toLocaleString()}, got {r.actualCredits.toLocaleString()})</>
            )}
            {r.expectedDebits != null && r.debitsMatch === false && (
              <> (debits: expected {Math.abs(r.expectedDebits).toLocaleString()}, got {Math.abs(r.actualDebits).toLocaleString()})</>
            )}
          </p>
        ))}
      </div>
    )
  }
  return (
    <>
      {items.map((r) =>
        r.matched ? (
          <span key={r.filename} className="text-green-600" data-testid="reconciliation-ok">
            ✓ Totals match the statement summary
          </span>
        ) : (
          <span key={r.filename} className="text-amber-600" data-testid="reconciliation-mismatch">
            ⚠ Parsed totals differ from the statement summary
            {r.expectedCredits != null && r.creditsMatch === false && (
              <> (credits: expected {r.expectedCredits.toLocaleString()}, got {r.actualCredits.toLocaleString()})</>
            )}
            {r.expectedDebits != null && r.debitsMatch === false && (
              <> (debits: expected {Math.abs(r.expectedDebits).toLocaleString()}, got {Math.abs(r.actualDebits).toLocaleString()})</>
            )}
          </span>
        )
      )}
    </>
  )
}

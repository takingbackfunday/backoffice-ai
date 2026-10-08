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

export function ReconciliationNotices({ items }: { items: ReconciliationMeta[] }) {
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

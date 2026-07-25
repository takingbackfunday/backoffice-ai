'use client'

import type { PreviewRow } from '@/types'

export function PreviewTable({
  rows,
  loading,
}: {
  rows: PreviewRow[]
  loading: boolean
}) {
  return (
    <div className="overflow-auto rounded-lg border flex-1">
      <table className="w-full text-xs" aria-label="Transaction preview" data-testid="preview-table">
        <thead className="bg-muted sticky top-0 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Date</th>
            <th className="px-3 py-2 text-left font-medium">Description</th>
            <th className="px-3 py-2 text-left font-medium">Notes</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Amount</th>
            <th className="px-3 py-2 text-left font-medium">Payee</th>
            <th className="px-3 py-2 text-left font-medium">Category</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                Preview will appear here.
              </td>
            </tr>
          ) : (
            rows.slice(0, 100).map((row, i) => (
              <tr
                key={`${i}-${row.duplicateHash}`}
                className={`border-t ${row.isDuplicate ? 'opacity-40' : ''}`}
                data-testid={`preview-row-${row.isDuplicate ? 'duplicate' : 'new'}`}
              >
                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                  {new Date(row.date).toLocaleDateString()}
                </td>
                <td className="px-3 py-1.5 max-w-[180px]">
                  <span className="block truncate">{row.description}</span>
                </td>
                <td className="px-3 py-1.5 max-w-[120px] text-muted-foreground">
                  <span className="block truncate">{row.notes ?? '—'}</span>
                </td>
                <td className={`px-3 py-1.5 text-right font-mono ${row.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {row.payeeId
                    ? <span className="text-green-700">✓ matched</span>
                    : <span>—</span>}
                </td>
                <td className="px-3 py-1.5">
                  {row.suggestedCategory ? (
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        row.suggestionConfidence === 'high'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                      title={row.suggestionConfidence === 'medium' ? 'Review suggested' : undefined}
                    >
                      {row.suggestedCategory}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {row.isDuplicate
                    ? <span className="text-muted-foreground">duplicate</span>
                    : <span className="text-green-600">new</span>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function previewNewCount(rows: PreviewRow[]): number {
  return rows.filter((r) => !r.isDuplicate).length
}

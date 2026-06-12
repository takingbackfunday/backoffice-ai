'use client'

export function BulkDeleteBar({
  selectMode,
  selectedIds,
  bulkDeleting,
  bulkDeletedCount,
  deletingIds,
  onConfirmBulkDelete,
  onExitSelectMode,
  onSetSelectMode,
  onSetAddingRow,
  addingRow,
}: {
  selectMode: boolean
  selectedIds: Set<string>
  bulkDeleting: boolean
  bulkDeletedCount: number
  deletingIds: Set<string>
  onConfirmBulkDelete: () => void
  onExitSelectMode: () => void
  onSetSelectMode: (v: boolean) => void
  onSetAddingRow: (v: boolean) => void
  addingRow: boolean
}) {
  return (
    <div className="flex items-center gap-px rounded-lg border border-black/10 bg-black/[0.03] p-0.5">
      {!addingRow && (
        <button
          onClick={() => onSetAddingRow(true)}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-white hover:shadow-sm transition-all"
          data-testid="new-transaction-btn"
        >
          + New transaction
        </button>
      )}
      <a
        href="/upload"
        className="rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-white hover:shadow-sm transition-all"
      >
        ↑ Upload CSV
      </a>
      {!bulkDeleting && (
        selectMode ? (
          <div className="flex items-center gap-1 pl-0.5">
            {selectedIds.size > 0 && (
              <span className="text-xs text-muted-foreground px-1">{selectedIds.size} selected</span>
            )}
            <button
              onClick={onConfirmBulkDelete}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-white"
              style={{
                backgroundColor: '#dc2626',
                animation: selectedIds.size > 0 ? 'bulkDeletePulse 2s ease-in-out infinite' : 'none',
              }}
              data-testid="bulk-delete-confirm-btn"
              aria-label="Confirm delete selected"
            >
              {selectedIds.size > 0 ? `Delete ${selectedIds.size}` : 'Select transactions'}
            </button>
            <button
              onClick={onExitSelectMode}
              className="text-muted-foreground hover:text-foreground leading-none px-1.5 text-sm"
              aria-label="Cancel selection"
            >✕</button>
          </div>
        ) : (
          <button
            onClick={() => onSetSelectMode(true)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-white hover:shadow-sm transition-all"
            data-testid="delete-transactions-btn"
          >
            Delete transactions
          </button>
        )
      )}
      {bulkDeleting && (
        <div className="flex items-center gap-1.5 px-2.5 text-xs" role="status" aria-live="polite">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
          <span className="text-muted-foreground">Deleting {bulkDeletedCount} of {bulkDeletedCount + deletingIds.size}…</span>
        </div>
      )}
    </div>
  )
}

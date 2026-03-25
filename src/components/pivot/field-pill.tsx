'use client'

interface FieldPillProps {
  fieldKey: string
  label: string
  zone?: 'rows' | 'cols' | 'reportFilters' | 'available'
  isFiltered?: boolean
  onRemove?: () => void
  onDragStart?: (e: React.DragEvent) => void
}

const ZONE_COLORS: Record<string, string> = {
  rows: 'bg-blue-100 text-blue-800 border-blue-200',
  cols: 'bg-pink-100 text-pink-800 border-pink-200',
  reportFilters: 'bg-amber-100 text-amber-800 border-amber-200',
  available: 'bg-muted text-foreground border-border',
}

export function FieldPill({ fieldKey, label, zone = 'available', isFiltered, onRemove, onDragStart }: FieldPillProps) {
  return (
    <span
      draggable
      onDragStart={onDragStart}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium cursor-grab active:cursor-grabbing select-none ${ZONE_COLORS[zone]}`}
      data-field-key={fieldKey}
    >
      {label}
      {isFiltered && <span className="text-indigo-500" title="Filter active">●</span>}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 opacity-60 hover:opacity-100 leading-none"
          aria-label={`Remove ${label}`}
          title={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  )
}

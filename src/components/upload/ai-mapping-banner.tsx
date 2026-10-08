'use client'

import { CheckCircle, Sparkles, Undo2 } from 'lucide-react'
import type { AiMappingChange, AiMappedField } from '@/lib/ai-mapping-changes'

const FIELD_LABELS: Record<AiMappedField, string> = {
  dateCol: 'Date',
  amountCol: 'Amount',
  descCol: 'Description',
  notesCol: 'Notes',
}

export function AiMappingBanner({
  changes,
  onUndo,
  onKeep,
}: {
  changes: AiMappingChange[]
  onUndo: () => void
  onKeep: () => void
}) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/8 p-3 space-y-2" role="status" data-testid="ai-mapping-banner">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Sparkles className="size-3.5" aria-hidden="true" /> AI updated your column mapping
      </p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {changes.map((change) => (
          <li key={change.field}>
            AI changed <strong className="text-foreground">{FIELD_LABELS[change.field]}</strong>:{' '}
            <code>{change.from ?? 'none'}</code> → <code>{change.to}</code>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={onUndo} className="inline-flex items-center gap-1 text-xs text-foreground hover:underline">
          <Undo2 className="size-3" aria-hidden="true" /> Undo
        </button>
        <button type="button" onClick={onKeep} className="inline-flex items-center gap-1 text-xs text-foreground hover:underline">
          <CheckCircle className="size-3" aria-hidden="true" /> Keep
        </button>
      </div>
    </div>
  )
}

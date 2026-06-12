'use client'

import { Sparkles, CheckCircle, Undo2 } from 'lucide-react'

interface AiConfirmBannerProps {
  onConfirm: () => void
  onUndo: () => void
}

export function AiConfirmBanner({ onConfirm, onUndo }: AiConfirmBannerProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-primary font-medium">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        AI made changes — review the highlighted fields above
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onUndo}
          className="flex items-center gap-1 rounded-md border border-primary/30 px-2.5 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
        >
          <Undo2 className="h-3 w-3" />
          Undo
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <CheckCircle className="h-3 w-3" />
          Confirm
        </button>
      </div>
    </div>
  )
}

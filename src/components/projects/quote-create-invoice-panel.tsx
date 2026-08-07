'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

interface Props {
  onCreate: (dueDate: string) => Promise<void>
  onCancel: () => void
  loading: string | null
}

export function QuoteCreateInvoicePanel({ onCreate, onCancel, loading }: Props) {
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!dueDate) { setError('Due date is required'); return }
    setError(null)
    await onCreate(dueDate)
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Create Invoice from Quote</p>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => { setDueDate(e.target.value); setError(null) }}
            className="ml-2 text-sm border rounded px-2 py-1 bg-background"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={loading === 'create-invoice'}
          className="text-sm px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading === 'create-invoice' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Invoice'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

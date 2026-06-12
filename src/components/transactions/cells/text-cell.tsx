'use client'

import { useEffect, useRef, useState } from 'react'

export function TextCell({
  value,
  onCommit,
  onCancel,
  type = 'text',
  autoFocus = true,
}: {
  value: string
  onCommit: (v: string) => void
  onCancel: () => void
  type?: 'text' | 'number' | 'date'
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); ref.current?.select() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <input
      ref={ref}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(draft) } // commit but stay in row
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => { if (draft !== value) onCommit(draft) }} // only PATCH if value changed
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-400"
      aria-label="Edit cell value"
    />
  )
}

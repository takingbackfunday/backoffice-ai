'use client'

import { useEffect, useRef } from 'react'
import type { Workspace } from '@/generated/prisma/client'

export function WorkspaceCell({
  value,
  projects,
  onCommit,
  onCancel,
  autoFocus = false,
}: {
  value: string | null
  projects: Workspace[]
  onCommit: (v: string | null) => void
  onCancel: () => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLSelectElement>(null)

  useEffect(() => { if (autoFocus) ref.current?.focus() }, [])

  return (
    <select
      ref={ref}
      defaultValue={value ?? ''}
      onChange={(e) => {
        const scrollY = window.scrollY
        onCommit(e.target.value || null)
        requestAnimationFrame(() => { window.scrollTo({ top: scrollY, behavior: 'instant' }) })
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-400"
      aria-label="Select project"
    >
      <option value="">— None —</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}

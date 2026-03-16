'use client'

import { useEffect, useState } from 'react'

interface Project {
  id: string
  name: string
  type: string
}

interface Props {
  value: string | null
  onChange: (projectId: string | null) => void
  disabled?: boolean
}

export function ProjectSelect({ value, onChange, disabled }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((json) => setProjects(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled || loading}
      className="rounded-md border px-3 py-1.5 text-sm"
      aria-label="Assign transaction to a project"
      data-testid="project-select"
    >
      <option value="">— no project —</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.type})
        </option>
      ))}
    </select>
  )
}

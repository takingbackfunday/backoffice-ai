'use client'

import { useState } from 'react'
import { Building2, Users, Tag } from 'lucide-react'
import { PROJECT_TYPE_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  name: string
  type: string
  isActive: boolean
  description?: string | null
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  CLIENT: Users,
  PROPERTY: Building2,
  OTHER: Tag,
}

export function ProjectDetailHeader({ id, name, type, isActive, description }: Props) {
  const [active, setActive] = useState(isActive)
  const [toggling, setToggling] = useState(false)

  const Icon = TYPE_ICONS[type] ?? Tag

  async function toggleActive() {
    setToggling(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !active }),
      })
      if (res.ok) setActive(!active)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{name}</h1>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
          {PROJECT_TYPE_LABELS[type] ?? type}
        </span>
        <button
          onClick={toggleActive}
          disabled={toggling}
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
            active
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {toggling ? '…' : active ? 'Active' : 'Inactive'}
        </button>
      </div>
      {description && (
        <p className="text-sm text-muted-foreground ml-8">{description}</p>
      )}
    </div>
  )
}

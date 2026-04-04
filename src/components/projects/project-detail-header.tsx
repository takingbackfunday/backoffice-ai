'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Users, Tag, Pencil, Trash2, Check, X } from 'lucide-react'
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
  const router = useRouter()
  const [active, setActive] = useState(isActive)
  const [toggling, setToggling] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(name)
  const [savingName, setSavingName] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  function startEditName() {
    setEditingName(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function saveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === name) {
      setNameValue(name)
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        setNameValue(name)
      }
    } finally {
      setSavingName(false)
      setEditingName(false)
    }
  }

  function cancelEdit() {
    setNameValue(name)
    setEditingName(false)
  }

  async function deleteProject() {
    setDeleting(true)
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      router.push('/projects')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />

        {editingName ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') cancelEdit()
              }}
              className="text-2xl font-bold bg-transparent border-b border-primary outline-none w-64"
              disabled={savingName}
              autoFocus
            />
            <button onClick={saveName} disabled={savingName} className="text-primary hover:text-primary/80">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={cancelEdit} disabled={savingName} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group">
            <h1 className="text-2xl font-bold">{name}</h1>
            <button
              onClick={startEditName}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
              title="Rename project"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

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

        <div className="ml-auto flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-muted-foreground">Delete project?</span>
              <button
                onClick={deleteProject}
                disabled={deleting}
                className="rounded px-2 py-1 text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded px-2 py-1 text-xs font-medium border hover:bg-muted"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-muted-foreground hover:text-red-600 transition-colors"
              title="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {description && (
        <p className="text-sm text-muted-foreground ml-8">{description}</p>
      )}
    </div>
  )
}

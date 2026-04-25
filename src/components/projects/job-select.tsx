'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Loader2, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Job { id: string; name: string }

interface Props {
  value: string
  onChange: (jobId: string) => void
  jobs: Job[]
  projectId: string
  placeholder?: string
  required?: boolean
  className?: string
}

export function JobSelect({
  value,
  onChange,
  jobs: initialJobs,
  projectId,
  placeholder = '— none —',
  required = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState(initialJobs)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setJobs(initialJobs) }, [initialJobs])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAdding(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const selected = jobs.find(j => j.id === value)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create job'); return }
      const job: Job = { id: json.data.id, name: json.data.name }
      setJobs(prev => [job, ...prev])
      onChange(job.id)
      setAdding(false)
      setNewName('')
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full border rounded px-2 py-1.5 text-sm bg-background flex items-center justify-between text-left gap-1"
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected?.name ?? placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[180px] rounded-lg border bg-popover shadow-md overflow-hidden">
          <div className="max-h-52 overflow-y-auto py-1">
            {!required && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left',
                  !value && 'font-medium',
                )}
              >
                <span className="w-3 shrink-0">{!value && <Check className="h-3 w-3" />}</span>
                <span className="text-muted-foreground">{placeholder}</span>
              </button>
            )}
            {jobs.map(j => (
              <button
                key={j.id}
                type="button"
                onClick={() => { onChange(j.id); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left',
                  j.id === value && 'font-medium',
                )}
              >
                <span className="w-3 shrink-0">{j.id === value && <Check className="h-3 w-3" />}</span>
                <span className="truncate">{j.name}</span>
              </button>
            ))}
            {jobs.length === 0 && !adding && (
              <p className="px-3 py-1.5 text-xs text-muted-foreground">No jobs yet</p>
            )}
          </div>

          <div className="border-t">
            {adding ? (
              <form onSubmit={handleAdd} className="flex items-center gap-1 p-2">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setAdding(false); setNewName('') }
                  }}
                  placeholder="Job name…"
                  className="flex-1 min-w-0 border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || saving}
                  className="shrink-0 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50 flex items-center"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewName('') }}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground px-1"
                >
                  ✕
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <Plus className="h-3.5 w-3.5" /> Add job
              </button>
            )}
            {error && <p className="text-xs text-destructive px-3 pb-2">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

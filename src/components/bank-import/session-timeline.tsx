'use client'

import { AlertCircle, FileDown, Info, MousePointerClick, ShieldAlert } from 'lucide-react'
import type { SessionEvent } from './hooks/use-bank-import-session'

const ICONS = {
  status: Info,
  action: MousePointerClick,
  warning: ShieldAlert,
  artifact: FileDown,
  error: AlertCircle,
}

export function SessionTimeline({ events }: { events: SessionEvent[] }) {
  const visible = events.filter((event) => event.type !== 'trace').slice(-80)
  return (
    <section className="min-h-28 space-y-2" aria-label="Import activity">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
      {visible.length === 0 ? <p className="text-sm text-muted-foreground">Waiting for the import service…</p> : (
        <ol className="max-h-40 space-y-2 overflow-y-auto">
          {visible.map((event) => {
            const Icon = ICONS[event.type as keyof typeof ICONS] ?? Info
            return (
              <li key={event.id} className="flex items-start gap-2 text-sm">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">{event.message}</span>
                <time className="shrink-0 text-[11px] text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

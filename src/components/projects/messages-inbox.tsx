'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Thread {
  tenantId: string
  tenantName: string
  unitLabel: string
  unitId: string
  lastMessage: string
  lastAt: string
  unread: number
}

interface Props {
  projectId: string
  slug: string
  threads: Thread[]
}

function fmtDate(d: string) {
  const date = new Date(d)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function MessagesInbox({ slug, threads }: Props) {
  const pathname = usePathname()

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <MessageSquare className="h-10 w-10 mb-3 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No messages yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Messages from tenants will appear here.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border divide-y overflow-hidden">
      {threads.map(t => {
        const href = `/projects/${slug}/messages/${t.tenantId}`
        const active = pathname === href
        return (
          <Link
            key={t.tenantId}
            href={href}
            className={cn(
              'flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors',
              active && 'bg-muted/30'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className={cn('text-sm', t.unread > 0 ? 'font-semibold' : 'font-medium')}>
                  {t.tenantName}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">{fmtDate(t.lastAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">{t.unitLabel}</p>
              <p className={cn('text-sm truncate', t.unread > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                {t.lastMessage}
              </p>
            </div>
            {t.unread > 0 && (
              <span className="mt-1 shrink-0 rounded-full bg-primary w-2 h-2" />
            )}
          </Link>
        )
      })}
    </div>
  )
}

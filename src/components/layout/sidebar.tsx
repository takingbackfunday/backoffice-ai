'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '⬜' },
  { href: '/upload', label: 'Import CSV', icon: '⬆' },
  { href: '/transactions', label: 'Transactions', icon: '↕' },
  { href: '/accounts', label: 'Accounts', icon: '🏦' },
  { href: '/projects', label: 'Projects', icon: '📁' },
  { href: '/categories', label: 'Categories', icon: '🏷' },
  { href: '/payees', label: 'Payees', icon: '👤' },
  { href: '/rules', label: 'Rules', icon: '⚡' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [pending, setPending] = useState<string | null>(null)

  // Clear pending state once navigation completes
  useEffect(() => {
    setPending(null)
  }, [pathname])

  return (
    <nav
      className="w-56 flex-shrink-0 border-r bg-background flex flex-col py-6 px-3"
      aria-label="Main navigation"
      data-testid="sidebar"
    >
      <div className="mb-8 px-3">
        <h1 className="text-lg font-bold tracking-tight">Backoffice AI</h1>
        <p className="text-xs text-muted-foreground">Financial management</p>
      </div>

      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname === href
          const isPending = pending === href && !isActive
          return (
            <li key={href}>
              <Link
                href={href}
                aria-label={label}
                data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`}
                onClick={() => { if (!isActive) setPending(href) }}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isPending
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {isPending ? (
                  <span aria-hidden="true" className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <span aria-hidden="true">{icon}</span>
                )}
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

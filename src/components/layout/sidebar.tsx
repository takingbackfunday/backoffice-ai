'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/upload', label: 'Import CSV', icon: '⬆' },
  { href: '/bank-sync', label: 'Bank Sync', icon: '🔄' },
  { href: '/transactions', label: 'Transactions', icon: '💳' },
  { href: '/accounts', label: 'Accounts', icon: '🏦' },
  { href: '/projects', label: 'Projects', icon: '📁' },
  { href: '/categories', label: 'Categories', icon: '🏷' },
  { href: '/payees', label: 'Payees', icon: '👤' },
  { href: '/rules', label: 'Rules', icon: '⚡' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [pending, setPending] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem('sidebar-collapsed', String(!c))
      return !c
    })
  }

  // Clear pending state once navigation completes
  useEffect(() => {
    setPending(null)
  }, [pathname])

  return (
    <nav
      className={cn(
        'flex-shrink-0 border-r bg-background flex flex-col py-6 transition-all duration-200 h-screen sticky top-0 overflow-y-auto',
        collapsed ? 'w-14 px-2' : 'w-56 px-3'
      )}
      aria-label="Main navigation"
      data-testid="sidebar"
    >
      {/* Logo / title */}
      <div className={cn('mb-8', collapsed ? 'px-1' : 'px-3')}>
        {collapsed ? (
          <span className="text-lg font-bold">B</span>
        ) : (
          <>
            <h1 className="text-lg font-bold tracking-tight">Backoffice AI</h1>
            <p className="text-xs text-muted-foreground">Financial management</p>
          </>
        )}
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
                title={collapsed ? label : undefined}
                data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`}
                onClick={() => { if (!isActive) setPending(href) }}
                className={cn(
                  'flex items-center rounded-md text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                  isActive
                    ? 'bg-[#f5f5f4] text-[#1a1a1a] font-medium border-r-2 border-[#534AB7]'
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
                {!collapsed && label}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapsed}
        className={cn(
          'mt-auto pt-4 border-t border-black/[0.06] flex items-center rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
          collapsed ? 'justify-center px-2' : 'gap-2'
        )}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className={cn('w-4 h-4 shrink-0 transition-transform duration-200', collapsed ? 'rotate-180' : '')}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
        </svg>
        {!collapsed && <span>Collapse</span>}
      </button>
    </nav>
  )
}

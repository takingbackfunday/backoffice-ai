'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const TOP_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/transactions', label: 'Transactions', icon: '💳' },
  { href: '/pivot', label: 'Pivot Table', icon: '📋' },
]

const IMPORT_ITEMS = [
  { href: '/upload', label: 'Upload CSV', icon: '⬆' },
  { href: '/connections', label: 'Auto Sync', icon: '🔗' },
  { href: '/bank-sync', label: 'Manual Sync', icon: '🔄' },
]

const MORE_ITEMS = [
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
  const [importOpen, setImportOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  // Auto-open accordion if active route is inside it
  useEffect(() => {
    if (IMPORT_ITEMS.some(i => i.href === pathname)) setImportOpen(true)
    if (MORE_ITEMS.some(i => i.href === pathname)) setMoreOpen(true)
  }, [pathname])

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

  function NavLink({ href, label, icon, indent = false }: { href: string; label: string; icon: string; indent?: boolean }) {
    const isActive = pathname === href
    const isPending = pending === href && !isActive
    return (
      <li>
        <Link
          href={href}
          aria-label={label}
          title={collapsed ? label : undefined}
          data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
          onClick={() => { if (!isActive) setPending(href) }}
          className={cn(
            'flex items-center rounded-md text-sm font-medium transition-colors',
            collapsed ? 'justify-center px-2 py-2' : cn('gap-3 py-2', indent ? 'pl-7 pr-3' : 'px-3'),
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
  }

  function AccordionToggle({ label, icon, isOpen, onToggle, isChildActive }: {
    label: string; icon: string; isOpen: boolean; onToggle: () => void; isChildActive: boolean
  }) {
    return (
      <li>
        <button
          onClick={onToggle}
          title={collapsed ? label : undefined}
          aria-expanded={isOpen}
          className={cn(
            'w-full flex items-center rounded-md text-sm font-medium transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
            isChildActive && !isOpen
              ? 'text-[#534AB7] font-semibold'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <span aria-hidden="true">{icon}</span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{label}</span>
              <svg
                className={cn('w-3.5 h-3.5 shrink-0 transition-transform duration-200', isOpen ? 'rotate-180' : '')}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </>
          )}
        </button>
      </li>
    )
  }

  const importChildActive = IMPORT_ITEMS.some(i => i.href === pathname)
  const moreChildActive = MORE_ITEMS.some(i => i.href === pathname)

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
        {/* Top-level items */}
        {TOP_ITEMS.map(item => (
          <NavLink key={item.href} {...item} />
        ))}

        {/* Import Transactions accordion */}
        <AccordionToggle
          label="Import Transactions"
          icon="🔗"
          isOpen={importOpen}
          onToggle={() => setImportOpen(v => !v)}
          isChildActive={importChildActive}
        />
        {(importOpen || collapsed) && IMPORT_ITEMS.map(item => (
          <NavLink key={item.href} {...item} indent={!collapsed} />
        ))}

        {/* Divider */}
        {!collapsed && <li className="my-1 border-t border-black/[0.06]" />}

        {/* More Options accordion */}
        <AccordionToggle
          label="More Options"
          icon="⋯"
          isOpen={moreOpen}
          onToggle={() => setMoreOpen(v => !v)}
          isChildActive={moreChildActive}
        />
        {(moreOpen || collapsed) && MORE_ITEMS.map(item => (
          <NavLink key={item.href} {...item} indent={!collapsed} />
        ))}
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

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getTerminology, type BusinessType } from '@/lib/terminology'
import type { UserPreferenceData } from '@/types/preferences'

const FINANCE_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/transactions', label: 'Transactions', icon: '💳' },
  { href: '/pivot', label: 'Pivot Table', icon: '📋' },
]

const MORE_ITEMS = [
  { href: '/categories', label: 'Categories', icon: '🏷' },
  { href: '/payees', label: 'Payees', icon: '👤' },
  { href: '/rules', label: 'Rules', icon: '⚡' },
]

const IMPORT_ITEMS = [
  { href: '/upload', label: 'Upload CSV', icon: '⬆' },
  { href: '/bank-accounts', label: 'Bank Accounts', icon: '🏦' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [pending, setPending] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [financeOpen, setFinanceOpen] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [businessType, setBusinessType] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('businessType')
    if (stored) {
      setBusinessType(stored)
      return
    }
    fetch('/api/preferences')
      .then(r => r.json())
      .then(json => {
        const bt = (json.data as UserPreferenceData)?.businessType
        if (bt) {
          localStorage.setItem('businessType', bt)
          setBusinessType(bt)
        }
      })
      .catch(() => {})
  }, [])

  const projectsItems = useMemo(() => {
    const items: { href: string; label: string; icon: string }[] = []

    if (businessType === 'freelance' || businessType === 'both') {
      items.push({ href: '/studio', label: 'Client Hub', icon: '🎯' })
    }
    if (businessType === 'property' || businessType === 'both') {
      items.push({ href: '/portfolio', label: 'Properties', icon: '🏘️' })
    }
    if (businessType === 'personal' || !businessType) {
      items.push({ href: '/projects', label: 'Projects', icon: '📁' })
    }

    if (businessType === 'freelance' || businessType === 'both' || businessType === 'property') {
      items.push({ href: '/vendors', label: 'Vendors', icon: '🔧' })
    }
    items.push({ href: '/receipts', label: 'Receipts', icon: '🧾' })
    items.push({ href: '/settings', label: 'Settings', icon: '⚙️' })

    return items
  }, [businessType])

  const sectionLabel = businessType
    ? getTerminology(businessType as BusinessType).sidebarSectionLabel
    : 'Projects'

  // Auto-open parent accordion when child route is active
  useEffect(() => {
    if (FINANCE_ITEMS.some(i => pathname.startsWith(i.href)) || MORE_ITEMS.some(i => i.href === pathname)) setFinanceOpen(true)
    if (MORE_ITEMS.some(i => i.href === pathname)) setMoreOpen(true)
    if (IMPORT_ITEMS.some(i => i.href === pathname)) setImportOpen(true)
    if (projectsItems.some(i => pathname.startsWith(i.href))) setProjectsOpen(true)
  }, [pathname, projectsItems])

  useEffect(() => { setPending(null) }, [pathname])

  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem('sidebar-collapsed', String(!c))
      return !c
    })
  }

  function NavLink({ href, label, icon, indent = false }: { href: string; label: string; icon: string; indent?: boolean }) {
    const isActive = href === '/projects' ? pathname === href || pathname.startsWith('/projects/') : pathname === href
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
            'flex items-center text-xs font-medium transition-colors w-full',
            collapsed ? 'justify-center px-2 py-1.5' : cn('gap-2.5 py-1.5', indent ? 'pl-8 pr-4' : 'px-4'),
            isActive
              ? 'bg-[#f5f5f4] text-[#1a1a1a] font-medium border-r-2 border-[#534AB7]'
              : isPending
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {isPending ? (
            <span aria-hidden="true" className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
          ) : (
            <span aria-hidden="true" className="text-sm">{icon}</span>
          )}
          {!collapsed && label}
        </Link>
      </li>
    )
  }

  function AccordionToggle({ label, icon, isOpen, onToggle, isChildActive, indent = false }: {
    label: string; icon: string; isOpen: boolean; onToggle: () => void; isChildActive: boolean; indent?: boolean
  }) {
    return (
      <li>
        <button
          onClick={onToggle}
          title={collapsed ? label : undefined}
          aria-expanded={isOpen}
          className={cn(
            'w-full flex items-center transition-colors',
            collapsed ? 'justify-center px-2 py-1.5' : cn('gap-2.5 py-1.5', indent ? 'pl-8 pr-4' : 'px-4'),
            indent
              ? cn('text-xs font-medium', isChildActive && !isOpen ? 'text-[#534AB7] font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
              : cn('text-[11px] font-semibold uppercase tracking-wide', isChildActive && !isOpen ? 'bg-[#3d3d3d] text-[#e5e5e5]' : 'bg-[#3d3d3d] text-[#e5e5e5] hover:bg-[#484848]')
          )}
        >
          <span aria-hidden="true" className="text-sm">{icon}</span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{label}</span>
              <svg
                className={cn('w-3 h-3 shrink-0 transition-transform duration-200', isOpen ? 'rotate-180' : '')}
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

  const financeChildActive = FINANCE_ITEMS.some(i => pathname.startsWith(i.href))
  const moreChildActive = MORE_ITEMS.some(i => i.href === pathname)
  const importChildActive = IMPORT_ITEMS.some(i => i.href === pathname)
  const projectsChildActive = projectsItems.some(i => pathname.startsWith(i.href)) || pathname === '/settings'

  return (
    <nav
      className={cn(
        'flex-shrink-0 border-r bg-background flex flex-col py-6 transition-all duration-200 h-screen sticky top-0 overflow-y-auto shadow-[4px_0_16px_-4px_rgba(0,0,0,0.08)]',
        collapsed ? 'w-14' : 'w-56'
      )}
      aria-label="Main navigation"
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className={cn('mb-8', collapsed ? 'px-2' : 'px-4')}>
        {collapsed ? (
          <span className="text-lg font-bold">B</span>
        ) : (
          <>
            <h1 className="text-lg font-bold tracking-tight">Backoffice AI</h1>
            <p className="text-xs text-muted-foreground">Financial management</p>
          </>
        )}
      </div>

      <ul className="flex flex-col gap-0.5">

        {/* View Finances accordion */}
        <AccordionToggle
          label="View Finances"
          icon="💰"
          isOpen={financeOpen}
          onToggle={() => setFinanceOpen(v => !v)}
          isChildActive={financeChildActive || moreChildActive}
        />
        {(financeOpen || collapsed) && (
          <>
            {FINANCE_ITEMS.map(item => (
              <NavLink key={item.href} {...item} indent={!collapsed} />
            ))}
            {/* More Options nested accordion */}
            <AccordionToggle
              label="More Options"
              icon="⋯"
              isOpen={moreOpen}
              onToggle={() => setMoreOpen(v => !v)}
              isChildActive={moreChildActive}
              indent={!collapsed}
            />
            {(moreOpen || collapsed) && MORE_ITEMS.map(item => (
              <NavLink key={item.href} {...item} indent={!collapsed} />
            ))}
          </>
        )}

        {!collapsed && <li className="my-0.5 border-t border-black/[0.06]" />}

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

        {!collapsed && <li className="my-0.5 border-t border-black/[0.06]" />}

        {/* Projects/Clients/Properties accordion */}
        <AccordionToggle
          label={sectionLabel}
          icon="📁"
          isOpen={projectsOpen}
          onToggle={() => setProjectsOpen(v => !v)}
          isChildActive={projectsChildActive}
        />
        {(projectsOpen || collapsed) && projectsItems.map(item => (
          <NavLink key={item.href} {...item} indent={!collapsed} />
        ))}

        {/* Collapse toggle */}
        <li className="border-t border-black/[0.06] mt-0.5">
          <button
            onClick={toggleCollapsed}
            className={cn(
              'w-full flex items-center py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
              collapsed ? 'justify-center px-2' : 'gap-2 px-4'
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
        </li>

      </ul>
    </nav>
  )
}

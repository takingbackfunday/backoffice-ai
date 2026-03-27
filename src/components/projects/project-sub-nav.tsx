'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Tab {
  label: string
  href: string
}

function getTabsForType(slug: string, type: string): Tab[] {
  const base = `/projects/${slug}`
  if (type === 'CLIENT') {
    return [
      { label: 'Overview', href: base },
      { label: 'Jobs', href: `${base}/jobs` },
      { label: 'Financials', href: `${base}/financials` },
    ]
  }
  if (type === 'PROPERTY') {
    return [
      { label: 'Overview', href: base },
      { label: 'Units', href: `${base}/units` },
      { label: 'Tenants', href: `${base}/tenants` },
      { label: 'Leases', href: `${base}/leases` },
      { label: 'Maintenance', href: `${base}/maintenance` },
      { label: 'Financials', href: `${base}/financials` },
    ]
  }
  return [{ label: 'Overview', href: base }]
}

interface Props {
  slug: string
  type: string
}

export function ProjectSubNav({ slug, type }: Props) {
  const pathname = usePathname()
  const tabs = getTabsForType(slug, type)

  return (
    <nav className="border-b mb-6" aria-label="Project navigation">
      <div className="flex gap-0">
        {tabs.map(tab => {
          const isActive = tab.href === `/projects/${slug}`
            ? pathname === tab.href
            : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

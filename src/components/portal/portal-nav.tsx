'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/portal', label: 'Dashboard' },
  { href: '/portal/payments', label: 'Payments' },
  { href: '/portal/messages', label: 'Messages' },
  { href: '/portal/maintenance', label: 'Maintenance' },
  { href: '/portal/documents', label: 'Documents' },
]

export function PortalNav() {
  const pathname = usePathname()

  return (
    <nav className="border-b px-6" aria-label="Portal navigation">
      <div className="flex gap-0 -mb-px">
        {NAV.map(item => {
          const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

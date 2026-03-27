'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LEASE_STATUS_LABELS, LEASE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'

interface Lease {
  id: string; status: string; startDate: string; endDate: string;
  unit: { id: string; unitLabel: string }
}
interface Tenant {
  id: string; name: string; email: string; phone: string | null;
  leases: Lease[]
}

interface Props {
  projectId: string
  tenants: Tenant[]
}

export function TenantList({ tenants }: Props) {
  const pathname = usePathname()
  // Derive slug from pathname: /projects/[slug]/tenants
  const slug = pathname.split('/')[2]

  if (tenants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No tenants yet. Add a lease to create a tenant relationship.</p>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Name</th>
            <th className="text-left px-4 py-2 font-medium">Email</th>
            <th className="text-left px-4 py-2 font-medium">Unit</th>
            <th className="text-left px-4 py-2 font-medium">Lease status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tenants.map(tenant => {
            const activeLease = tenant.leases.find(l => ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'].includes(l.status))
              ?? tenant.leases[0]
            return (
              <tr key={tenant.id} className="hover:bg-muted/20">
                <td className="px-4 py-2">
                  <Link
                    href={`/projects/${slug}/tenants/${tenant.id}`}
                    className="font-medium hover:underline text-primary"
                  >
                    {tenant.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{tenant.email}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {activeLease?.unit.unitLabel ?? '—'}
                </td>
                <td className="px-4 py-2">
                  {activeLease ? (
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEASE_STATUS_COLORS[activeLease.status] ?? 'bg-muted')}>
                      {LEASE_STATUS_LABELS[activeLease.status] ?? activeLease.status}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

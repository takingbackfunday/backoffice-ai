'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { LEASE_STATUS_LABELS, LEASE_STATUS_COLORS } from '@/types'
import { LeaseForm } from './lease-form'
import { cn } from '@/lib/utils'

interface UnitOption { id: string; unitLabel: string }
interface TenantOption { id: string; name: string; email: string }

interface Lease {
  id: string; status: string; startDate: string; endDate: string;
  monthlyRent: number; securityDeposit: number | null;
  unit: { id: string; unitLabel: string };
  tenant: { id: string; name: string; email: string };
  _count: { tenantCharges: number; tenantPayments: number }
}

interface Props {
  projectId: string
  leases: Lease[]
  units: UnitOption[]
  tenants: TenantOption[]
}

export function LeaseList({ projectId, leases: initial, units, tenants }: Props) {
  const [leases, setLeases] = useState<Lease[]>(initial)
  const [showForm, setShowForm] = useState(false)

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  function handleCreated(lease: unknown) {
    setLeases(prev => [lease as Lease, ...prev])
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">{leases.length} lease{leases.length !== 1 ? 's' : ''}</h2>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New lease
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Create lease</h3>
          <LeaseForm
            projectId={projectId}
            units={units}
            tenants={tenants}
            onCreated={handleCreated}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {leases.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">No leases yet.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Unit</th>
                <th className="text-left px-4 py-2 font-medium">Tenant</th>
                <th className="text-left px-4 py-2 font-medium">Period</th>
                <th className="text-left px-4 py-2 font-medium">Rent</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leases.map(lease => (
                <tr key={lease.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">{lease.unit.unitLabel}</td>
                  <td className="px-4 py-2 text-muted-foreground">{lease.tenant.name}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {fmtDate(lease.startDate)} — {fmtDate(lease.endDate)}
                  </td>
                  <td className="px-4 py-2 font-medium">{fmt(Number(lease.monthlyRent))}/mo</td>
                  <td className="px-4 py-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEASE_STATUS_COLORS[lease.status] ?? 'bg-muted')}>
                      {LEASE_STATUS_LABELS[lease.status] ?? lease.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

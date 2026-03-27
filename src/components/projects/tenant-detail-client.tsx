'use client'

import { LEASE_STATUS_LABELS, LEASE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'

interface RentPayment { id: string; amount: number; dueDate: string; paidDate: string | null; status: string }
interface Lease {
  id: string; status: string; startDate: string; endDate: string;
  monthlyRent: number; unit: { id: string; unitLabel: string };
  rentPayments: RentPayment[]
}
interface MaintenanceRequest { id: string; title: string; status: string; priority: string; createdAt: string }
interface TenantFile { id: string; fileType: string; fileName: string; createdAt: string; fileUrl: string }
interface Tenant {
  id: string; name: string; email: string; phone: string | null;
  emergencyName: string | null; emergencyPhone: string | null;
  leases: Lease[]; tenantFiles: TenantFile[]; maintenanceRequests: MaintenanceRequest[]
}

interface Props {
  projectId: string
  tenant: Tenant
}

export function TenantDetailClient({ tenant }: Props) {
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Contact info */}
      <div className="rounded-lg border p-4">
        <h2 className="text-sm font-semibold mb-3">{tenant.name}</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{tenant.email}</dd>
          {tenant.phone && (
            <>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{tenant.phone}</dd>
            </>
          )}
          {tenant.emergencyName && (
            <>
              <dt className="text-muted-foreground">Emergency contact</dt>
              <dd>{tenant.emergencyName}</dd>
            </>
          )}
          {tenant.emergencyPhone && (
            <>
              <dt className="text-muted-foreground">Emergency phone</dt>
              <dd>{tenant.emergencyPhone}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Lease history */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Lease history</h3>
        {tenant.leases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leases.</p>
        ) : (
          <div className="space-y-3">
            {tenant.leases.map(lease => (
              <div key={lease.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{lease.unit.unitLabel}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEASE_STATUS_COLORS[lease.status] ?? 'bg-muted')}>
                    {LEASE_STATUS_LABELS[lease.status] ?? lease.status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtDate(lease.startDate)} — {fmtDate(lease.endDate)} · {fmt(Number(lease.monthlyRent))}/mo
                </div>
                {lease.rentPayments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {lease.rentPayments.slice(0, 3).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{fmtDate(p.dueDate)}</span>
                        <span>{fmt(Number(p.amount))}</span>
                        <span className={cn('rounded-full px-1.5 py-0.5', p.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800')}>
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Maintenance requests */}
      {tenant.maintenanceRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Maintenance requests</h3>
          <div className="space-y-2">
            {tenant.maintenanceRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>{req.title}</span>
                <span className="text-xs text-muted-foreground">{req.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      {tenant.tenantFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Documents</h3>
          <div className="space-y-2">
            {tenant.tenantFiles.map(f => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>{f.fileName}</span>
                <span className="text-xs text-muted-foreground">{f.fileType}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

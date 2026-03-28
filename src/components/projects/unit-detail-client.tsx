'use client'

import { UNIT_STATUS_LABELS, UNIT_STATUS_COLORS, LEASE_STATUS_LABELS, LEASE_STATUS_COLORS, MAINTENANCE_PRIORITY_COLORS, MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS } from '@/types'
import { cn } from '@/lib/utils'
import { MessageThread } from './message-thread'

interface Tenant { id: string; name: string; email: string; phone: string | null }
interface RentPayment { id: string; amount: number; dueDate: string; paidDate: string | null; status: string }
interface Lease {
  id: string; status: string; startDate: string; endDate: string;
  monthlyRent: number; securityDeposit: number | null; paymentDueDay: number;
  tenant: Tenant; rentPayments: RentPayment[]
}
interface MaintenanceRequest {
  id: string; title: string; description: string; priority: string; status: string;
  createdAt: string; scheduledDate: string | null; cost: number | null; vendorName: string | null;
  tenant: Tenant | null
}
interface Message {
  id: string; senderRole: string; subject: string | null; body: string; createdAt: string; isRead: boolean;
  tenant: Tenant
}
interface UnitDetail {
  id: string; unitLabel: string; status: string; bedrooms: number | null;
  bathrooms: number | null; squareFootage: number | null; monthlyRent: number | null;
  leases: Lease[]; maintenanceRequests: MaintenanceRequest[]; messages: Message[]
}

interface Props {
  projectId: string
  unit: UnitDetail
}

export function UnitDetailClient({ projectId, unit }: Props) {
  const activeLease = unit.leases.find(l => ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'].includes(l.status))

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Unit header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{unit.unitLabel}</h2>
          <div className="flex items-center gap-2 mt-1">
            {unit.bedrooms !== null && <span className="text-sm text-muted-foreground">{unit.bedrooms} bed</span>}
            {unit.bathrooms !== null && <span className="text-sm text-muted-foreground">{unit.bathrooms} bath</span>}
            {unit.squareFootage && <span className="text-sm text-muted-foreground">{unit.squareFootage} sq ft</span>}
          </div>
        </div>
        <span className={cn('rounded-full px-3 py-1 text-sm font-medium', UNIT_STATUS_COLORS[unit.status] ?? 'bg-muted text-muted-foreground')}>
          {UNIT_STATUS_LABELS[unit.status] ?? unit.status}
        </span>
      </div>

      {/* Active lease */}
      {activeLease ? (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Current lease</h3>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEASE_STATUS_COLORS[activeLease.status] ?? 'bg-muted')}>
              {LEASE_STATUS_LABELS[activeLease.status] ?? activeLease.status}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Tenant</dt>
            <dd>{activeLease.tenant.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{activeLease.tenant.email}</dd>
            {activeLease.tenant.phone && (
              <>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{activeLease.tenant.phone}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Rent</dt>
            <dd className="font-medium">{fmt(Number(activeLease.monthlyRent))}/mo</dd>
            <dt className="text-muted-foreground">Lease period</dt>
            <dd>{fmtDate(activeLease.startDate)} — {fmtDate(activeLease.endDate)}</dd>
            {activeLease.securityDeposit && (
              <>
                <dt className="text-muted-foreground">Security deposit</dt>
                <dd>{fmt(Number(activeLease.securityDeposit))}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Due day</dt>
            <dd>Day {activeLease.paymentDueDay} of month</dd>
          </dl>

          {/* Recent payments */}
          {activeLease.rentPayments.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent payments</h4>
              <div className="space-y-1">
                {activeLease.rentPayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{fmtDate(p.dueDate)}</span>
                    <span>{fmt(Number(p.amount))}</span>
                    <span className={cn('rounded-full px-1.5 py-0.5', p.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800')}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No active lease. Create a lease to get started.
        </div>
      )}

      {/* Maintenance requests */}
      {unit.maintenanceRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Maintenance requests</h3>
          <div className="space-y-2">
            {unit.maintenanceRequests.map(req => (
              <div key={req.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{req.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-4">
                    <span className={cn('rounded-full px-1.5 py-0.5 text-xs', MAINTENANCE_PRIORITY_COLORS[req.priority] ?? 'bg-muted')}>
                      {MAINTENANCE_PRIORITY_LABELS[req.priority] ?? req.priority}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {MAINTENANCE_STATUS_LABELS[req.status] ?? req.status}
                    </span>
                  </div>
                </div>
                {req.cost !== null && (
                  <p className="text-xs text-muted-foreground mt-1">Cost: {fmt(Number(req.cost))}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {activeLease && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Messages</h3>
          <MessageThread
            projectId={projectId}
            unitId={unit.id}
            tenantId={activeLease.tenant.id}
            tenantName={activeLease.tenant.name}
            initialMessages={unit.messages}
          />
        </div>
      )}
    </div>
  )
}

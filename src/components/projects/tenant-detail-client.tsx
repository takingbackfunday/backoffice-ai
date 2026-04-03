'use client'

import { useState } from 'react'
import { Mail, CheckCircle, Clock } from 'lucide-react'
import { LEASE_STATUS_LABELS, LEASE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'

interface InvoiceSummary {
  id: string; lineItemTotal: number; paymentTotal: number;
}
interface Lease {
  id: string; status: string; startDate: string; endDate: string;
  monthlyRent: number; unit: { id: string; unitLabel: string };
  invoices: InvoiceSummary[]
}
interface MaintenanceRequest { id: string; title: string; status: string; priority: string; createdAt: string }
interface TenantFile { id: string; fileType: string; fileName: string; createdAt: string; fileUrl: string }
interface Tenant {
  id: string; name: string; email: string; phone: string | null;
  emergencyName: string | null; emergencyPhone: string | null;
  portalInviteStatus: string; clerkUserId: string | null;
  leases: Lease[]; tenantFiles: TenantFile[]; maintenanceRequests: MaintenanceRequest[]
}

interface Props {
  projectId: string
  tenant: Tenant
}

const INVITE_LABELS: Record<string, string> = {
  NONE: 'Not invited',
  INVITED: 'Invite sent',
  ACTIVE: 'Portal active',
}
const INVITE_COLORS: Record<string, string> = {
  NONE: 'bg-gray-100 text-gray-600',
  INVITED: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
}

export function TenantDetailClient({ projectId, tenant }: Props) {
  const [inviteStatus, setInviteStatus] = useState(tenant.portalInviteStatus)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  async function handleInvite() {
    setInviting(true)
    setInviteError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/tenants/${tenant.id}/invite`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) { setInviteError(json.error ?? 'Failed to send invite'); return }
      setInviteStatus('INVITED')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Contact info */}
      <div className="rounded-lg border p-4">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-sm font-semibold">{tenant.name}</h2>
          <div className="flex items-center gap-2">
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium flex items-center gap-1', INVITE_COLORS[inviteStatus] ?? 'bg-muted')}>
              {inviteStatus === 'ACTIVE' && <CheckCircle className="h-3 w-3" />}
              {inviteStatus === 'INVITED' && <Clock className="h-3 w-3" />}
              {INVITE_LABELS[inviteStatus] ?? inviteStatus}
            </span>
            <button
              type="button"
              onClick={handleInvite}
              disabled={inviting}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              {inviting ? 'Sending…' : inviteStatus === 'NONE' ? 'Invite to portal' : 'Resend invite'}
            </button>
          </div>
        </div>
        {inviteError && <p className="text-xs text-destructive mb-2">{inviteError}</p>}
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
                {lease.invoices.length > 0 && (() => {
                  const charged = lease.invoices.reduce((s, inv) => s + inv.lineItemTotal, 0)
                  const paid = lease.invoices.reduce((s, inv) => s + inv.paymentTotal, 0)
                  const balance = charged - paid
                  return (
                    <div className="mt-2 flex gap-3 text-xs">
                      <span className="text-muted-foreground">Charged: {fmt(charged)}</span>
                      <span className="text-green-700">Paid: {fmt(paid)}</span>
                      <span className={balance > 0 ? 'text-red-700' : 'text-green-700'}>
                        Balance: {balance > 0 ? `+${fmt(balance)}` : fmt(balance)}
                      </span>
                    </div>
                  )
                })()}
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

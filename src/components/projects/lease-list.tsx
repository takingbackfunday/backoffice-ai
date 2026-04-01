'use client'

import { useState } from 'react'
import { Plus, FileText, Send, CheckCircle, Loader2 } from 'lucide-react'
import { LEASE_STATUS_LABELS, LEASE_STATUS_COLORS } from '@/types'
import { LeaseForm } from './lease-form'
import { cn } from '@/lib/utils'

interface UnitOption { id: string; unitLabel: string }
interface TenantOption { id: string; name: string; email: string }

interface Lease {
  id: string; status: string; startDate: string; endDate: string;
  monthlyRent: number; securityDeposit: number | null;
  contractStatus: string;
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

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  NONE: 'No contract',
  DRAFTING: 'Drafting',
  READY: 'Ready',
  SENT: 'Sent',
  SIGNED: 'Signed',
  COUNTERSIGNED: 'Countersigned',
}

const CONTRACT_STATUS_COLORS: Record<string, string> = {
  NONE: 'bg-gray-100 text-gray-500',
  DRAFTING: 'bg-amber-100 text-amber-700',
  READY: 'bg-blue-100 text-blue-700',
  SENT: 'bg-indigo-100 text-indigo-700',
  SIGNED: 'bg-emerald-100 text-emerald-700',
  COUNTERSIGNED: 'bg-green-100 text-green-700',
}

export function LeaseList({ projectId, leases: initial, units, tenants }: Props) {
  const [leases, setLeases] = useState<Lease[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [contractAction, setContractAction] = useState<string | null>(null)
  const [contractError, setContractError] = useState<Record<string, string>>({})

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  function handleCreated(lease: unknown) {
    setLeases(prev => [lease as Lease, ...prev])
    setShowForm(false)
  }

  function updateLeaseContract(leaseId: string, contractStatus: string) {
    setLeases(prev => prev.map(l => l.id === leaseId ? { ...l, contractStatus } : l))
  }

  async function handleGenerateContract(leaseId: string) {
    setContractAction(leaseId + ':generate')
    setContractError(prev => ({ ...prev, [leaseId]: '' }))
    try {
      const res = await fetch(`/api/projects/${projectId}/leases/${leaseId}/contract`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) {
        setContractError(prev => ({ ...prev, [leaseId]: json.error ?? 'Failed to generate' }))
        return
      }
      updateLeaseContract(leaseId, json.data.contractStatus)
    } finally {
      setContractAction(null)
    }
  }

  async function handleDownloadContract(leaseId: string) {
    window.open(`/api/projects/${projectId}/leases/${leaseId}/contract`, '_blank')
  }

  async function handleSendContract(leaseId: string) {
    setContractAction(leaseId + ':send')
    setContractError(prev => ({ ...prev, [leaseId]: '' }))
    try {
      const res = await fetch(`/api/projects/${projectId}/leases/${leaseId}/contract/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) {
        setContractError(prev => ({ ...prev, [leaseId]: json.error ?? 'Failed to send' }))
        return
      }
      updateLeaseContract(leaseId, json.data.contractStatus)
    } finally {
      setContractAction(null)
    }
  }

  async function handleMarkSigned(leaseId: string) {
    setContractAction(leaseId + ':sign')
    setContractError(prev => ({ ...prev, [leaseId]: '' }))
    try {
      const res = await fetch(`/api/projects/${projectId}/leases/${leaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractStatus: 'SIGNED', contractSignedAt: new Date().toISOString() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setContractError(prev => ({ ...prev, [leaseId]: json.error ?? 'Failed to update' }))
        return
      }
      updateLeaseContract(leaseId, 'SIGNED')
    } finally {
      setContractAction(null)
    }
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
                <th className="text-left px-4 py-2 font-medium">Contract</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {leases.map(lease => {
                const cs = lease.contractStatus ?? 'NONE'
                const busy = contractAction?.startsWith(lease.id)
                return (
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
                    <td className="px-4 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', CONTRACT_STATUS_COLORS[cs] ?? 'bg-muted')}>
                        {CONTRACT_STATUS_LABELS[cs] ?? cs}
                      </span>
                      {contractError[lease.id] && (
                        <p className="text-[10px] text-destructive mt-0.5">{contractError[lease.id]}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        {/* Generate / Download */}
                        {cs === 'NONE' || cs === 'DRAFTING' ? (
                          <button
                            type="button"
                            onClick={() => handleGenerateContract(lease.id)}
                            disabled={!!busy}
                            className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
                            title="Generate contract PDF"
                          >
                            {busy && contractAction === lease.id + ':generate'
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <FileText className="h-3 w-3" />}
                            Generate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDownloadContract(lease.id)}
                            className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium hover:bg-muted transition-colors"
                            title="Download contract PDF"
                          >
                            <FileText className="h-3 w-3" />
                            PDF
                          </button>
                        )}

                        {/* Send */}
                        {(cs === 'READY' || cs === 'SENT') && (
                          <button
                            type="button"
                            onClick={() => handleSendContract(lease.id)}
                            disabled={!!busy}
                            className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
                            title={`Send contract to ${lease.tenant.email}`}
                          >
                            {busy && contractAction === lease.id + ':send'
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Send className="h-3 w-3" />}
                            {cs === 'SENT' ? 'Resend' : 'Send'}
                          </button>
                        )}

                        {/* Mark signed */}
                        {cs === 'SENT' && (
                          <button
                            type="button"
                            onClick={() => handleMarkSigned(lease.id)}
                            disabled={!!busy}
                            className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            title="Mark contract as signed"
                          >
                            {busy && contractAction === lease.id + ':sign'
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <CheckCircle className="h-3 w-3" />}
                            Signed
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'
import { NewWorkOrderModal } from '@/components/work-orders/new-work-order-modal'

interface Bill {
  id: string
  amount: number
  status: string
}

interface WorkOrder {
  id: string
  title: string
  description: string | null
  status: string
  agreedCost: number | null
  scheduledDate: string | null
  createdAt: string
  vendor: { id: string; name: string } | null
  job: { id: string; name: string } | null
  bills: Bill[]
}

interface Props {
  projectId: string
  projectSlug: string
  workOrders: WorkOrder[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export function WorkOrderList({ projectId, projectSlug, workOrders: initial }: Props) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initial)
  const [showModal, setShowModal] = useState(false)

  function handleCreated() {
    setShowModal(false)
    // Re-fetch by reloading — work orders are server-fetched
    window.location.reload()
  }

  const totalCost = workOrders.reduce((s, wo) => {
    const billed = wo.bills.reduce((bs, b) => bs + b.amount, 0)
    return s + (billed > 0 ? billed : (wo.agreedCost ?? 0))
  }, 0)

  const openCount = workOrders.filter(wo =>
    !['COMPLETED', 'PAID', 'CANCELLED'].includes(wo.status)
  ).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">
            {workOrders.length} work order{workOrders.length !== 1 ? 's' : ''}
          </h2>
          {openCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {openCount} open
            </span>
          )}
          {totalCost > 0 && (
            <span className="text-xs text-muted-foreground">{fmt(totalCost)} total</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New work order
        </button>
      </div>

      {workOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No work orders yet. Create one to track subcontractor assignments across your jobs.
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Work Order</th>
                <th className="text-left px-4 py-2 font-medium">Job</th>
                <th className="text-left px-4 py-2 font-medium">Vendor</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Cost</th>
                <th className="text-left px-4 py-2 font-medium">Bills</th>
                <th className="text-left px-4 py-2 font-medium">Scheduled</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {workOrders.map(wo => {
                const totalBilled = wo.bills.reduce((s, b) => s + b.amount, 0)
                const displayCost = totalBilled > 0 ? totalBilled : wo.agreedCost
                const jobHref = wo.job
                  ? `/projects/${projectSlug}/jobs/${wo.job.id}`
                  : `/projects/${projectSlug}/jobs`

                return (
                  <tr key={wo.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <Link
                        href={jobHref}
                        className="font-medium hover:underline"
                      >
                        {wo.title}
                      </Link>
                      {wo.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs">{wo.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {wo.job ? (
                        <Link
                          href={`/projects/${projectSlug}/jobs/${wo.job.id}`}
                          className="text-xs rounded-full bg-green-50 px-2 py-0.5 text-green-800 border border-green-200 hover:bg-green-100 transition-colors"
                        >
                          {wo.job.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {wo.vendor ? (
                        <Link
                          href={`/vendors/${wo.vendor.id}`}
                          className="hover:underline"
                        >
                          {wo.vendor.name}
                        </Link>
                      ) : (
                        <span className="italic text-muted-foreground/60">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', WORK_ORDER_STATUS_COLORS[wo.status] ?? 'bg-muted text-muted-foreground')}>
                        {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {displayCost != null && displayCost > 0 ? (
                        <span className={totalBilled > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                          {fmt(displayCost)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {wo.bills.length > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {wo.bills.length} bill{wo.bills.length !== 1 ? 's' : ''}
                          {wo.bills.some(b => b.status === 'PAID') && (
                            <span className="ml-1 text-green-700">· paid</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {wo.scheduledDate
                        ? new Date(wo.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NewWorkOrderModal
          defaultType="CLIENT"
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

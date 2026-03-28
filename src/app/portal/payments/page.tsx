import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import { getPortalSession } from '@/lib/portal-auth'
import { CHARGE_TYPE_LABELS, CHARGE_TYPE_COLORS } from '@/types'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default async function PortalPaymentsPage() {
  const session = await getPortalSession()
  if (!session) redirect('/dashboard')

  const lease = await prisma.lease.findFirst({
    where: {
      tenantId: session.tenantId,
      status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] },
    },
    include: {
      unit: { select: { unitLabel: true } },
      tenantCharges: { orderBy: { dueDate: 'asc' } },
      tenantPayments: { orderBy: { paidDate: 'desc' } },
    },
    orderBy: { startDate: 'desc' },
  })

  if (!lease) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">No active lease found.</p>
        </div>
      </div>
    )
  }

  const activeCharges = lease.tenantCharges.filter(c => !c.forgivenAt)
  const totalCharged = activeCharges.reduce((sum, c) => sum + Number(c.amount), 0)
  const totalPaid = lease.tenantPayments.reduce((sum, p) => sum + Number(p.amount), 0)
  const balance = totalCharged - totalPaid

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Unit {lease.unit.unitLabel} — {fmtDate(lease.startDate)} to {fmtDate(lease.endDate)}
        </p>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Total charged</p>
          <p className="text-lg font-semibold">{fmt(totalCharged)}</p>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Total paid</p>
          <p className="text-lg font-semibold text-green-700">{fmt(totalPaid)}</p>
        </div>
        <div className={cn('rounded-lg border px-4 py-3', balance > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50')}>
          <p className="text-xs text-muted-foreground mb-0.5">Balance</p>
          <p className={cn('text-lg font-semibold', balance > 0 ? 'text-amber-800' : 'text-green-800')}>
            {balance > 0 ? `${fmt(balance)} owed` : balance < 0 ? `${fmt(Math.abs(balance))} credit` : 'Current'}
          </p>
        </div>
      </div>

      {balance > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-900">
            You have {fmt(balance)} outstanding. Contact your landlord if you have questions.
          </p>
        </div>
      )}

      {/* Charges */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Charges</h2>
        {lease.tenantCharges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No charges yet.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Due date</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Description</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lease.tenantCharges.map(c => (
                  <tr key={c.id} className={cn('hover:bg-muted/20', c.forgivenAt && 'opacity-50')}>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(c.dueDate)}</td>
                    <td className="px-4 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', CHARGE_TYPE_COLORS[c.type] ?? 'bg-muted')}>
                        {CHARGE_TYPE_LABELS[c.type] ?? c.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">
                      {c.forgivenAt
                        ? <span className="line-through">{c.description ?? '—'} (forgiven)</span>
                        : c.description ?? '—'
                      }
                    </td>
                    <td className={cn('px-4 py-2 text-right font-medium tabular-nums', c.forgivenAt && 'line-through text-muted-foreground')}>
                      {fmt(Number(c.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payments received */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Payments received</h2>
        {lease.tenantPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                  <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Method</th>
                  <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lease.tenantPayments.map(p => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(p.paidDate)}</td>
                    <td className="px-4 py-2 text-right font-medium text-green-700 tabular-nums">{fmt(Number(p.amount))}</td>
                    <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{p.paymentMethod ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{p.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

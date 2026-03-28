import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import { getPortalSession } from '@/lib/portal-auth'

const STATUS_COLORS: Record<string, string> = {
  PENDING:    'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  PAID:       'bg-green-100 text-green-800',
  LATE:       'bg-red-100 text-red-800',
  PARTIAL:    'bg-orange-100 text-orange-800',
  FAILED:     'bg-red-100 text-red-800',
  WAIVED:     'bg-gray-100 text-gray-600',
}

export default async function PortalPaymentsPage() {
  const session = await getPortalSession()
  if (!session) redirect('/dashboard')
  const { tenantId } = session

  const payments = await prisma.rentPayment.findMany({
    where: { tenantId },
    include: { lease: { include: { unit: true } } },
    orderBy: { dueDate: 'desc' },
  })

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const totalOwed = payments
    .filter(p => ['PENDING', 'LATE'].includes(p.status))
    .reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">Your rent payment history.</p>
      </div>

      {totalOwed > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-900">
            You have {fmt(totalOwed)} due. Contact your landlord to arrange payment.
          </p>
        </div>
      )}

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payment records yet.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Due date</th>
                <th className="text-left px-4 py-2 font-medium">Unit</th>
                <th className="text-right px-4 py-2 font-medium">Amount</th>
                <th className="text-left px-4 py-2 font-medium">Paid</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 text-muted-foreground">{fmtDate(p.dueDate)}</td>
                  <td className="px-4 py-2">{p.lease.unit.unitLabel}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmt(Number(p.amount))}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.paidDate ? fmtDate(p.paidDate) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[p.status] ?? 'bg-muted')}>
                      {p.status}
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

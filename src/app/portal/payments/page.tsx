import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import { getPortalSession } from '@/lib/portal-auth'
import { CHARGE_TYPE_LABELS, CHARGE_TYPE_COLORS, INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/types'

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
      invoices: {
        where: { status: { not: 'VOID' } },
        include: { lineItems: true, payments: true },
        orderBy: { dueDate: 'desc' },
      },
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

  let totalCharged = 0
  let totalPaid = 0
  const invoiceSummaries = lease.invoices.map(inv => {
    const lineItemTotal = inv.lineItems
      .filter(li => !li.forgivenAt)
      .reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0)
    const paymentTotal = inv.payments
      .filter(p => !p.voidedAt)
      .reduce((s, p) => s + Number(p.amount), 0)
    totalCharged += lineItemTotal
    totalPaid += paymentTotal
    return { ...inv, lineItemTotal, paymentTotal, outstanding: lineItemTotal - paymentTotal }
  })
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

      {/* Invoices */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Invoices</h2>
        {invoiceSummaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="space-y-3">
            {invoiceSummaries.map(inv => (
              <div key={inv.id} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{inv.invoiceNumber}</span>
                    {inv.period && <span className="text-xs text-muted-foreground">{inv.period}</span>}
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', INVOICE_STATUS_COLORS[inv.status] ?? 'bg-muted')}>
                      {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(inv.outstanding)}</p>
                    <p className="text-[10px] text-muted-foreground">outstanding</p>
                  </div>
                </div>
                {/* Line items */}
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {inv.lineItems.map(li => (
                      <tr key={li.id} className={cn('hover:bg-muted/20', li.forgivenAt && 'opacity-50')}>
                        <td className="px-4 py-2">
                          {li.chargeType && (
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium mr-2', CHARGE_TYPE_COLORS[li.chargeType] ?? 'bg-muted')}>
                              {CHARGE_TYPE_LABELS[li.chargeType] ?? li.chargeType}
                            </span>
                          )}
                          {li.forgivenAt ? <span className="line-through text-muted-foreground">{li.description} (forgiven)</span> : li.description}
                        </td>
                        <td className={cn('px-4 py-2 text-right font-medium tabular-nums', li.forgivenAt && 'line-through text-muted-foreground')}>
                          {fmt(Number(li.quantity) * Number(li.unitPrice))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Payments */}
                {inv.payments.filter(p => !p.voidedAt).length > 0 && (
                  <div className="border-t bg-green-50/50 px-4 py-2 space-y-1">
                    {inv.payments.filter(p => !p.voidedAt).map(p => (
                      <div key={p.id} className="flex justify-between text-xs text-green-800">
                        <span>{fmtDate(p.paidDate)} {p.paymentMethod ? `— ${p.paymentMethod}` : ''}</span>
                        <span className="font-medium">−{fmt(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

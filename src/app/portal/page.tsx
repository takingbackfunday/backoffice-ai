import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { LEASE_STATUS_LABELS, LEASE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'
import { getPortalSession } from '@/lib/portal-auth'

export default async function PortalDashboardPage() {
  const session = await getPortalSession()
  if (!session) redirect('/dashboard')
  const { tenantId } = session

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      leases: {
        include: {
          unit: {
            include: {
              propertyProfile: { include: { workspace: true } },
            },
          },
          invoices: {
            where: { status: { not: 'VOID' } },
            include: { lineItems: true, payments: true },
            orderBy: { dueDate: 'desc' },
            take: 6,
          },
        },
        orderBy: { startDate: 'desc' },
      },
      maintenanceRequests: {
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      },
    },
  })

  if (!tenant) redirect('/dashboard')

  const activeLease = tenant.leases.find(l =>
    ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'].includes(l.status)
  )

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {tenant.name.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground mt-1">Here&apos;s a summary of your rental.</p>
      </div>

      {/* Active lease card */}
      {activeLease ? (
        <div className="rounded-lg border p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Current lease</p>
              <p className="text-lg font-semibold">
                {activeLease.unit.propertyProfile?.workspace?.name ?? activeLease.unit.unitLabel}
              </p>
              {activeLease.unit.unitLabel !== 'Main' && (
                <p className="text-sm text-muted-foreground">{activeLease.unit.unitLabel}</p>
              )}
            </div>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              LEASE_STATUS_COLORS[activeLease.status] ?? 'bg-muted'
            )}>
              {LEASE_STATUS_LABELS[activeLease.status] ?? activeLease.status}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Monthly rent</dt>
            <dd className="font-medium">{fmt(Number(activeLease.monthlyRent))}</dd>
            <dt className="text-muted-foreground">Lease ends</dt>
            <dd>{fmtDate(activeLease.endDate)}</dd>
            <dt className="text-muted-foreground">Due day</dt>
            <dd>Day {activeLease.paymentDueDay} of each month</dd>
          </dl>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          No active lease found.
        </div>
      )}

      {/* Balance summary */}
      {activeLease && activeLease.invoices.length > 0 && (() => {
        const charged = activeLease.invoices.reduce((s, inv) => s + inv.lineItems.filter(li => !li.forgivenAt).reduce((s2, li) => s2 + Number(li.quantity) * Number(li.unitPrice), 0), 0)
        const paid = activeLease.invoices.reduce((s, inv) => s + inv.payments.filter(p => !p.voidedAt).reduce((s2, p) => s2 + Number(p.amount), 0), 0)
        const balance = charged - paid
        return (
          <div>
            <h2 className="text-sm font-semibold mb-3">Balance</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-muted-foreground mb-0.5">Total charged</p>
                <p className="text-lg font-semibold">{fmt(charged)}</p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-muted-foreground mb-0.5">Total paid</p>
                <p className="text-lg font-semibold text-green-700">{fmt(paid)}</p>
              </div>
              <div className={cn('rounded-lg border px-4 py-3', balance > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50')}>
                <p className="text-xs text-muted-foreground mb-0.5">Balance</p>
                <p className={cn('text-lg font-semibold', balance > 0 ? 'text-amber-800' : 'text-green-800')}>
                  {balance > 0 ? `${fmt(balance)} owed` : balance < 0 ? `${fmt(Math.abs(balance))} credit` : 'Current'}
                </p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Open maintenance requests */}
      {tenant.maintenanceRequests.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3">Open maintenance requests</h2>
          <div className="space-y-2">
            {tenant.maintenanceRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                <p className="font-medium">{req.title}</p>
                <span className="text-xs text-muted-foreground">{req.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface Kpis {
  activeClients: number
  openInvoices: number
  totalOutstanding: number
  revenueThisMonth: number
  overdueCount: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  dueDate: string
  currency: string
  total: number
  paid: number
}

interface Client {
  id: string
  name: string
  slug: string
  company: string | null
  outstanding: number
  currency: string
  invoiceCount: number
  lastInvoiceDate: string | null
  lastInvoiceNumber: string | null
  recentInvoices: Invoice[]
}

interface Props {
  clients: Client[]
  kpis: Kpis
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-4', accent && 'border-red-200 bg-red-50')}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', accent && 'text-red-700')}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

export function StudioClient({ clients, kpis }: Props) {
  if (clients.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm text-muted-foreground mb-2">No client projects yet.</p>
        <Link href="/projects/new" className="text-sm text-primary hover:underline">
          Create your first client project →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Active clients" value={String(kpis.activeClients)} />
        <KpiCard label="Open invoices" value={String(kpis.openInvoices)} />
        <KpiCard
          label="Total outstanding"
          value={fmt(kpis.totalOutstanding)}
          sub="across all clients"
        />
        <KpiCard
          label="Revenue this month"
          value={fmt(kpis.revenueThisMonth)}
          sub="payments received"
        />
        <KpiCard
          label="Overdue"
          value={String(kpis.overdueCount)}
          sub="invoice(s)"
          accent={kpis.overdueCount > 0}
        />
      </div>

      {/* Client cards */}
      <div className="space-y-3">
        {clients.map(client => (
          <div key={client.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <Link
                  href={`/projects/${client.slug}`}
                  className="font-semibold hover:text-primary transition-colors"
                >
                  {client.name}
                </Link>
                {client.company && (
                  <p className="text-xs text-muted-foreground">{client.company}</p>
                )}
              </div>
              <div className="text-right">
                <p className={cn('text-lg font-bold tabular-nums', client.outstanding > 0 ? 'text-amber-700' : 'text-muted-foreground')}>
                  {fmt(client.outstanding, client.currency)}
                </p>
                <p className="text-xs text-muted-foreground">outstanding</p>
              </div>
            </div>

            {client.recentInvoices.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Invoice</th>
                      <th className="text-right px-3 py-1.5 font-medium">Total</th>
                      <th className="text-right px-3 py-1.5 font-medium">Balance</th>
                      <th className="text-left px-3 py-1.5 font-medium">Status</th>
                      <th className="text-left px-3 py-1.5 font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {client.recentInvoices.map(inv => {
                      const balance = inv.total - inv.paid
                      const isOverdue = inv.status !== 'PAID' && inv.status !== 'VOID' && new Date(inv.dueDate) < new Date()
                      const displayStatus = isOverdue && inv.status === 'SENT' ? 'OVERDUE' : inv.status
                      return (
                        <tr key={inv.id} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5">
                            <Link
                              href={`/projects/${client.slug}/invoices/${inv.id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {inv.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(inv.total, inv.currency)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{balance > 0 ? fmt(balance, inv.currency) : '—'}</td>
                          <td className="px-3 py-1.5">
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', INVOICE_STATUS_COLORS[displayStatus] ?? '')}>
                              {INVOICE_STATUS_LABELS[displayStatus] ?? displayStatus}
                            </span>
                          </td>
                          <td className={cn('px-3 py-1.5', isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                            {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No invoices yet.</p>
            )}

            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {client.invoiceCount} invoice{client.invoiceCount !== 1 ? 's' : ''} total
              </p>
              <Link
                href={`/projects/${client.slug}/invoices`}
                className="text-xs text-primary hover:underline"
              >
                View all invoices →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

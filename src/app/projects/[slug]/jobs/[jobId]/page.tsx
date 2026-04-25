import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  JOB_STATUS_LABELS,
  BILLING_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
} from '@/types'

interface PageParams { params: Promise<{ slug: string; jobId: string }> }

const JOB_STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-100 text-gray-700',
  ACTIVE:    'bg-green-100 text-green-800',
  ON_HOLD:   'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
  CANCELLED: 'bg-gray-100 text-gray-400',
}

const QUOTE_STATUS_COLORS: Record<string, string> = {
  DRAFT:      'bg-gray-100 text-gray-700',
  SENT:       'bg-blue-100 text-blue-800',
  ACCEPTED:   'bg-green-100 text-green-800',
  REJECTED:   'bg-red-100 text-red-800',
  SUPERSEDED: 'bg-gray-100 text-gray-400',
  AMENDED:    'bg-amber-100 text-amber-800',
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT:      'Draft',
  SENT:       'Sent',
  ACCEPTED:   'Accepted',
  REJECTED:   'Rejected',
  SUPERSEDED: 'Superseded',
  AMENDED:    'Amended',
}

const ESTIMATE_STATUS_COLORS: Record<string, string> = {
  DRAFT:      'bg-gray-100 text-gray-700',
  FINAL:      'bg-green-100 text-green-800',
  SUPERSEDED: 'bg-gray-100 text-gray-400',
}

const ESTIMATE_STATUS_LABELS: Record<string, string> = {
  DRAFT:      'Draft',
  FINAL:      'Final',
  SUPERSEDED: 'Superseded',
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function invoiceTotal(items: { quantity: unknown; unitPrice: unknown }[]) {
  return items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
}

function invoicePaid(payments: { amount: unknown }[]) {
  return payments.reduce((s, p) => s + Number(p.amount), 0)
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{count}</span>
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={99} className="py-4 text-center text-xs text-muted-foreground">{label}</td>
    </tr>
  )
}

export default async function JobDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, jobId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: { clientProfile: true },
  })
  if (!project || !project.clientProfile) notFound()

  const job = await prisma.job.findFirst({
    where: { id: jobId, clientProfileId: project.clientProfile.id },
    include: {
      invoices: {
        include: {
          lineItems: { select: { quantity: true, unitPrice: true, isTaxLine: true } },
          payments: { select: { amount: true } },
        },
        orderBy: { issueDate: 'desc' },
      },
      quotes: {
        orderBy: { createdAt: 'desc' },
      },
      estimates: {
        orderBy: { createdAt: 'desc' },
      },
      timeEntries: {
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      },
    },
  })
  if (!job) notFound()

  const currency = project.clientProfile.currency ?? 'USD'

  const totalInvoiced = job.invoices.reduce((s, inv) => s + invoiceTotal(inv.lineItems), 0)
  const totalPaid     = job.invoices.reduce((s, inv) => s + invoicePaid(inv.payments), 0)
  const totalMinutes  = job.timeEntries.reduce((s, e) => s + e.minutes, 0)
  const totalHours    = totalMinutes / 60

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title={project.name} />
        <main className="flex-1 p-6" role="main">
          <ProjectDetailHeader
            id={project.id}
            name={project.name}
            type={project.type}
            isActive={project.isActive}
            description={project.description}
          />
          <ProjectSubNav slug={slug} type={project.type} />

          <div className="max-w-4xl">
            {/* Back link */}
            <Link
              href={`/projects/${slug}/jobs`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
            >
              <ChevronLeft className="w-3 h-3" /> All jobs
            </Link>

            {/* Job header */}
            <div className="flex items-start gap-3 mb-2">
              <h2 className="text-lg font-semibold">{job.name}</h2>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium mt-0.5', JOB_STATUS_COLORS[job.status])}>
                {JOB_STATUS_LABELS[job.status] ?? job.status}
              </span>
            </div>
            {job.description && (
              <p className="text-sm text-muted-foreground mb-3">{job.description}</p>
            )}

            {/* Meta strip */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground mb-6">
              <span>Billing: <span className="text-foreground">{job.billingType ? (BILLING_TYPE_LABELS[job.billingType] ?? job.billingType) : 'Default'}</span></span>
              {job.defaultRate && (
                <span>Rate: <span className="text-foreground">{fmt(Number(job.defaultRate), currency)}/hr</span></span>
              )}
              {job.budgetAmount && (
                <span>Budget: <span className="text-foreground">{fmt(Number(job.budgetAmount), currency)}</span></span>
              )}
              {job.startDate && (
                <span>Start: <span className="text-foreground">{fmtDate(job.startDate)}</span></span>
              )}
              {job.endDate && (
                <span>End: <span className="text-foreground">{fmtDate(job.endDate)}</span></span>
              )}
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Invoiced</p>
                <p className="text-sm font-semibold">{fmt(totalInvoiced, currency)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Collected</p>
                <p className="text-sm font-semibold">{fmt(totalPaid, currency)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Time logged</p>
                <p className="text-sm font-semibold">{totalHours.toFixed(1)} hrs</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Quotes</p>
                <p className="text-sm font-semibold">{job.quotes.length}</p>
              </div>
            </div>

            {/* ── Invoices ─────────────────────────────────────────────── */}
            <section className="mb-8">
              <SectionHeader title="Invoices" count={job.invoices.length} />
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Number</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                      <th className="text-right px-3 py-2 font-medium">Paid</th>
                      <th className="text-right px-3 py-2 font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {job.invoices.length === 0 ? (
                      <EmptyRow label="No invoices yet" />
                    ) : job.invoices.map(inv => {
                      const total = invoiceTotal(inv.lineItems)
                      const paid  = invoicePaid(inv.payments)
                      return (
                        <tr key={inv.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <Link
                              href={`/projects/${slug}/invoices/${inv.id}`}
                              className="font-medium hover:underline"
                            >
                              {inv.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full', INVOICE_STATUS_COLORS[inv.status])}>
                              {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(total, inv.currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(paid, inv.currency)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(inv.dueDate)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Quotes ───────────────────────────────────────────────── */}
            <section className="mb-8">
              <SectionHeader title="Quotes" count={job.quotes.length} />
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Number</th>
                      <th className="text-left px-3 py-2 font-medium">Title</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                      <th className="text-right px-3 py-2 font-medium">Valid until</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {job.quotes.length === 0 ? (
                      <EmptyRow label="No quotes yet" />
                    ) : job.quotes.map(q => (
                      <tr key={q.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <Link
                            href={`/projects/${slug}/quotes/${q.id}`}
                            className="font-medium hover:underline"
                          >
                            {q.quoteNumber} v{q.version}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{q.title}</td>
                        <td className="px-3 py-2">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', QUOTE_STATUS_COLORS[q.status] ?? 'bg-gray-100 text-gray-700')}>
                            {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {q.totalQuoted ? fmt(Number(q.totalQuoted), q.currency) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {q.validUntil ? fmtDate(q.validUntil) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Estimates ────────────────────────────────────────────── */}
            {job.estimates.length > 0 && (
              <section className="mb-8">
                <SectionHeader title="Estimates" count={job.estimates.length} />
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">Title</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-right px-3 py-2 font-medium">Version</th>
                        <th className="text-right px-3 py-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {job.estimates.map(est => (
                        <tr key={est.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <Link
                              href={`/projects/${slug}/estimates/${est.id}`}
                              className="font-medium hover:underline"
                            >
                              {est.title}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full', ESTIMATE_STATUS_COLORS[est.status] ?? 'bg-gray-100 text-gray-700')}>
                              {ESTIMATE_STATUS_LABELS[est.status] ?? est.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">v{est.version}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(est.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── Time entries ─────────────────────────────────────────── */}
            <section className="mb-8">
              <SectionHeader title="Time logged" count={job.timeEntries.length} />
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Hours</th>
                      <th className="text-right px-3 py-2 font-medium">Billable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {job.timeEntries.length === 0 ? (
                      <EmptyRow label="No time logged yet" />
                    ) : job.timeEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(entry.date)}</td>
                        <td className="px-3 py-2 max-w-[320px] truncate">{entry.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{(entry.minutes / 60).toFixed(1)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={entry.billable ? 'text-green-700' : 'text-muted-foreground'}>
                            {entry.billable ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {job.timeEntries.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5 text-right">
                  Total: {totalHours.toFixed(1)} hrs&nbsp;
                  ({(job.timeEntries.filter(e => e.billable).reduce((s, e) => s + e.minutes, 0) / 60).toFixed(1)} billable)
                </p>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

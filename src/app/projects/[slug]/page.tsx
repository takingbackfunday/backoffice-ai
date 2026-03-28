import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { PropertyOverview } from '@/components/projects/property-overview'
import { JOB_STATUS_LABELS } from '@/types'
import Link from 'next/link'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.project.findFirst({
    where: { userId, slug },
    include: {
      clientProfile: {
        include: { jobs: { orderBy: { createdAt: 'desc' }, take: 5 } },
      },
      propertyProfile: {
        include: {
          units: {
            include: {
              leases: {
                where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
                include: {
                  tenant: { select: { id: true, name: true, email: true, phone: true } },
                  tenantCharges: { orderBy: { dueDate: 'desc' }, take: 12 },
                  tenantPayments: { orderBy: { paidDate: 'desc' }, take: 12 },
                },
                orderBy: { startDate: 'desc' },
                take: 1,
              },
              maintenanceRequests: {
                where: { status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } },
                include: { tenant: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
              },
              messages: {
                where: { isRead: false, senderRole: 'tenant' },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: { tenant: { select: { id: true, name: true } } },
              },
              _count: {
                select: {
                  maintenanceRequests: { where: { status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } } },
                  messages: { where: { isRead: false, senderRole: 'tenant' } },
                },
              },
            },
            orderBy: { unitLabel: 'asc' },
          },
        },
      },
      _count: { select: { transactions: true } },
    },
  })

  if (!project) notFound()

  const serialized = JSON.parse(JSON.stringify(project))

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

          {/* CLIENT overview */}
          {project.type === 'CLIENT' && project.clientProfile && (
            <div className="space-y-6">
              {/* Client info */}
              <div className="rounded-lg border p-4">
                <h2 className="text-sm font-semibold mb-3">Client info</h2>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {project.clientProfile.contactName && (
                    <>
                      <dt className="text-muted-foreground">Contact</dt>
                      <dd>{project.clientProfile.contactName}</dd>
                    </>
                  )}
                  {project.clientProfile.company && (
                    <>
                      <dt className="text-muted-foreground">Company</dt>
                      <dd>{project.clientProfile.company}</dd>
                    </>
                  )}
                  {project.clientProfile.email && (
                    <>
                      <dt className="text-muted-foreground">Email</dt>
                      <dd>{project.clientProfile.email}</dd>
                    </>
                  )}
                  {project.clientProfile.phone && (
                    <>
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd>{project.clientProfile.phone}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Billing</dt>
                  <dd>{project.clientProfile.billingType}</dd>
                  <dt className="text-muted-foreground">Currency</dt>
                  <dd>{project.clientProfile.currency}</dd>
                  <dt className="text-muted-foreground">Payment terms</dt>
                  <dd>{project.clientProfile.paymentTermDays} days</dd>
                </dl>
              </div>

              {/* Recent jobs */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Recent jobs</h2>
                  <Link href={`/projects/${slug}/jobs`} className="text-xs text-primary hover:underline">
                    View all
                  </Link>
                </div>
                {serialized.clientProfile.jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No jobs yet.</p>
                ) : (
                  <div className="space-y-2">
                    {serialized.clientProfile.jobs.map((job: { id: string; name: string; status: string }) => (
                      <div key={job.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span>{job.name}</span>
                        <span className="text-xs text-muted-foreground">{JOB_STATUS_LABELS[job.status] ?? job.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PROPERTY overview */}
          {project.type === 'PROPERTY' && project.propertyProfile && (
            <PropertyOverview
              projectId={project.id}
              slug={slug}
              address={project.propertyProfile.address ?? null}
              city={project.propertyProfile.city ?? null}
              state={project.propertyProfile.state ?? null}
              propertyType={project.propertyProfile.propertyType ?? null}
              totalTransactions={project._count.transactions}
              units={(project.propertyProfile.units ?? []).map(u => ({
                id: u.id,
                unitLabel: u.unitLabel,
                status: u.status,
                monthlyRent: u.monthlyRent ? Number(u.monthlyRent) : null,
                bedrooms: u.bedrooms,
                tenant: u.leases[0]?.tenant ?? null,
                leaseId: u.leases[0]?.id ?? null,
                leaseEndDate: u.leases[0]?.endDate?.toISOString() ?? null,
                leaseStartDate: u.leases[0]?.startDate?.toISOString() ?? null,
                leaseStatus: u.leases[0]?.status ?? null,
                leaseMonthlyRent: u.leases[0]?.monthlyRent ? Number(u.leases[0].monthlyRent) : null,
                paymentDueDay: u.leases[0]?.paymentDueDay ?? null,
                openMaintenance: u._count.maintenanceRequests,
                unreadMessages: u._count.messages,
                maintenanceRequests: u.maintenanceRequests.map(m => ({
                  id: m.id,
                  title: m.title,
                  description: m.description,
                  priority: m.priority,
                  status: m.status,
                  createdAt: m.createdAt.toISOString(),
                  tenant: m.tenant ? { id: m.tenant.id, name: m.tenant.name } : null,
                })),
                tenantCharges: (u.leases[0]?.tenantCharges ?? []).map(c => ({
                  id: c.id,
                  type: c.type,
                  description: c.description ?? null,
                  amount: Number(c.amount),
                  dueDate: c.dueDate.toISOString(),
                  forgivenAt: c.forgivenAt?.toISOString() ?? null,
                })),
                tenantPayments: (u.leases[0]?.tenantPayments ?? []).map(p => ({
                  id: p.id,
                  amount: Number(p.amount),
                  paidDate: p.paidDate.toISOString(),
                  paymentMethod: p.paymentMethod ?? null,
                  notes: p.notes ?? null,
                })),
                recentMessages: u.messages.map(m => ({
                  id: m.id,
                  subject: m.subject,
                  body: m.body,
                  createdAt: m.createdAt.toISOString(),
                  isRead: m.isRead,
                  senderRole: m.senderRole,
                  tenant: m.tenant ? { id: m.tenant.id, name: m.tenant.name } : null,
                })),
              }))}
            />
          )}

          {/* OTHER overview */}
          {project.type === 'OTHER' && (
            <div className="rounded-lg border p-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Transactions</dt>
                <dd>{project._count.transactions}</dd>
              </dl>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

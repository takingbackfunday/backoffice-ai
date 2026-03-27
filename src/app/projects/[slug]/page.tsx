import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { JOB_STATUS_LABELS, UNIT_STATUS_LABELS, UNIT_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'
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
                include: { tenant: true },
                orderBy: { startDate: 'desc' },
                take: 1,
              },
              _count: { select: { maintenanceRequests: true } },
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
            <div className="space-y-6">
              {/* Property info */}
              <div className="rounded-lg border p-4">
                <h2 className="text-sm font-semibold mb-3">Property info</h2>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Address</dt>
                  <dd>{project.propertyProfile.address}</dd>
                  {project.propertyProfile.city && (
                    <>
                      <dt className="text-muted-foreground">City</dt>
                      <dd>{project.propertyProfile.city}</dd>
                    </>
                  )}
                  {project.propertyProfile.state && (
                    <>
                      <dt className="text-muted-foreground">State</dt>
                      <dd>{project.propertyProfile.state}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{project.propertyProfile.propertyType}</dd>
                </dl>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total units</p>
                  <p className="text-2xl font-semibold">{project.propertyProfile.units.length}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground mb-1">Leased</p>
                  <p className="text-2xl font-semibold">
                    {project.propertyProfile.units.filter(u => u.status === 'LEASED').length}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground mb-1">Transactions</p>
                  <p className="text-2xl font-semibold">{project._count.transactions}</p>
                </div>
              </div>

              {/* Units preview */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Units</h2>
                  <Link href={`/projects/${slug}/units`} className="text-xs text-primary hover:underline">
                    View all
                  </Link>
                </div>
                {serialized.propertyProfile.units.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No units yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {serialized.propertyProfile.units.slice(0, 6).map((unit: {
                      id: string; unitLabel: string; status: string; monthlyRent: number | null;
                      leases: Array<{ tenant: { name: string } }>
                    }) => (
                      <Link
                        key={unit.id}
                        href={`/projects/${slug}/units/${unit.id}`}
                        className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/20 transition-colors"
                      >
                        <div>
                          <p className="font-medium">{unit.unitLabel}</p>
                          {unit.leases[0]?.tenant && (
                            <p className="text-xs text-muted-foreground">{unit.leases[0].tenant.name}</p>
                          )}
                        </div>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          UNIT_STATUS_COLORS[unit.status] ?? 'bg-muted text-muted-foreground'
                        )}>
                          {UNIT_STATUS_LABELS[unit.status] ?? unit.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
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

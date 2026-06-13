import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { MessagesInbox } from '@/components/projects/messages-inbox'
import { MessageThread } from '@/components/projects/message-thread'

interface PageParams { params: Promise<{ slug: string; tenantId: string }> }

export default async function ProjectMessageThreadPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, tenantId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: { propertyProfile: { include: { units: { select: { id: true } } } } },
  })
  if (!project || !project.propertyProfile) notFound()

  const unitIds = project.propertyProfile.units.map(u => u.id)

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, userId },
    include: {
      leases: {
        where: { unitId: { in: unitIds } },
        orderBy: { startDate: 'desc' },
        take: 1,
      },
    },
  })
  if (!tenant) notFound()

  const unitId = tenant.leases[0]?.unitId ?? unitIds[0]

  const messages = await prisma.message.findMany({
    where: { tenantId, unitId },
    orderBy: { createdAt: 'asc' },
  })

  // Build thread list for sidebar
  const allMessages = await prisma.message.findMany({
    where: { unitId: { in: unitIds } },
    include: { tenant: true, unit: true },
    orderBy: { createdAt: 'desc' },
  })
  const threadMap = new Map<string, {
    tenantId: string; tenantName: string; unitLabel: string; unitId: string;
    subject: string | null; lastMessage: string; lastAt: string; unread: number
  }>()
  for (const msg of allMessages) {
    if (!threadMap.has(msg.tenantId)) {
      threadMap.set(msg.tenantId, {
        tenantId: msg.tenantId, tenantName: msg.tenant.name,
        unitLabel: msg.unit.unitLabel, unitId: msg.unitId,
        subject: msg.subject, lastMessage: msg.body,
        lastAt: msg.createdAt.toISOString(),
        unread: !msg.isRead && msg.senderRole === 'tenant' ? 1 : 0,
      })
    } else {
      const t = threadMap.get(msg.tenantId)!
      if (!t.subject && msg.subject) t.subject = msg.subject
      if (!msg.isRead && msg.senderRole === 'tenant') t.unread += 1
    }
  }
  const threads = Array.from(threadMap.values())

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Messages', href: `/projects/${slug}/messages` },
        { label: tenant.name },
      ]}
    >
      <div className="mt-6 grid grid-cols-[280px_1fr] gap-6 items-start">
        <MessagesInbox projectId={project.id} slug={slug} threads={threads} />
        <div>
          <div className="mb-4">
            <h2 className="text-sm font-semibold">{tenant.name}</h2>
            <p className="text-xs text-muted-foreground">{tenant.email}</p>
          </div>
          <MessageThread
            projectId={project.id}
            unitId={unitId}
            tenantId={tenantId}
            tenantName={tenant.name}
            initialMessages={JSON.parse(JSON.stringify(messages))}
          />
        </div>
      </div>
    </ProjectPageShell>
  )
}

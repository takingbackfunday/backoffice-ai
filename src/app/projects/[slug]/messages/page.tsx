import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { MessagesInbox } from '@/components/projects/messages-inbox'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectMessagesPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: { propertyProfile: { include: { units: { select: { id: true } } } } },
  })
  if (!project) notFound()
  if (!project.propertyProfile) redirect(`/projects/${slug}`)

  const unitIds = project.propertyProfile.units.map(u => u.id)

  // Get all messages grouped by tenant, most recent first
  const messages = await prisma.message.findMany({
    where: { unitId: { in: unitIds } },
    include: { tenant: true, unit: true },
    orderBy: { createdAt: 'desc' },
  })

  // Build thread list: one entry per tenant, showing last message
  const threadMap = new Map<string, {
    tenantId: string; tenantName: string; unitLabel: string; unitId: string
    subject: string | null; lastMessage: string; lastAt: string; unread: number
  }>()

  for (const msg of messages) {
    if (!threadMap.has(msg.tenantId)) {
      threadMap.set(msg.tenantId, {
        tenantId: msg.tenantId,
        tenantName: msg.tenant.name,
        unitLabel: msg.unit.unitLabel,
        unitId: msg.unitId,
        subject: msg.subject,
        lastMessage: msg.body,
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
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Messages' }]}
    >
      <MessagesInbox
        projectId={project.id}
        slug={slug}
        threads={threads}
      />
    </ProjectPageShell>
  )
}

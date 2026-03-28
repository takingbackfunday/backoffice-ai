import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { MessagesInbox } from '@/components/projects/messages-inbox'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectMessagesPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.project.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: { propertyProfile: { include: { units: { select: { id: true } } } } },
  })
  if (!project || !project.propertyProfile) notFound()

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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title={`${project.name} — Messages`} />
        <main className="flex-1 p-6" role="main">
          <ProjectDetailHeader
            id={project.id}
            name={project.name}
            type={project.type}
            isActive={project.isActive}
            description={project.description}
          />
          <ProjectSubNav slug={slug} type={project.type} />
          <MessagesInbox
            projectId={project.id}
            slug={slug}
            threads={threads}
          />
        </main>
      </div>
    </div>
  )
}

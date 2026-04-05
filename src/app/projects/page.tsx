import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectList } from '@/components/projects/project-list'

export default async function ProjectsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const projects = await prisma.workspace.findMany({
    where: { userId },
    include: {
      _count: { select: { transactions: true } },
      clientProfile: { include: { _count: { select: { jobs: true } } } },
      propertyProfile: { include: { _count: { select: { units: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Projects" />
        <main className="flex-1 p-6" role="main">
          <ProjectList projects={JSON.parse(JSON.stringify(projects))} />
        </main>
      </div>
    </div>
  )
}

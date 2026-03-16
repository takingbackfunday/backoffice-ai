import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

const PROJECT_TYPE_LABELS: Record<string, string> = {
  CLIENT: 'Client',
  PROPERTY: 'Property',
  JOB: 'Job',
  OTHER: 'Other',
}

export default async function ProjectsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const projects = await prisma.project.findMany({
    where: { userId },
    include: { _count: { select: { transactions: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Projects" />
        <main className="flex-1 p-6" role="main">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Clients, properties &amp; jobs</h2>
            <a
              href="/projects/new"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="add-project-btn"
              aria-label="Create a new project"
            >
              New project
            </a>
          </div>

          {projects.length === 0 ? (
            <p className="text-muted-foreground">
              No projects yet. Create a project to start tagging transactions.
            </p>
          ) : (
            <ul className="space-y-3" data-testid="projects-list">
              {projects.map((project) => (
                <li key={project.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{project.name}</p>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {PROJECT_TYPE_LABELS[project.type]}
                      </span>
                      {!project.isActive && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {project._count.transactions} transaction{project._count.transactions !== 1 ? 's' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  )
}

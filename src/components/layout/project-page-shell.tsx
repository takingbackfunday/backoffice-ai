import { Sidebar } from './sidebar'
import { Header } from './header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { PageBreadcrumb, type BreadcrumbItem } from './page-breadcrumb'

export type { BreadcrumbItem }

interface ProjectPageShellProps {
  project: {
    id: string
    name: string
    type: string
    isActive: boolean
    description?: string | null
  }
  slug: string
  breadcrumb: BreadcrumbItem[]
  children: React.ReactNode
}

export function getHubRoute(type: string): { label: string; href: string } {
  if (type === 'PROPERTY') return { label: 'Properties', href: '/portfolio' }
  if (type === 'CLIENT') return { label: 'Client Hub', href: '/studio' }
  return { label: 'Projects', href: '/projects' }
}

export function ProjectPageShell({ project, slug, breadcrumb, children }: ProjectPageShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header>
          <PageBreadcrumb items={breadcrumb} />
        </Header>
        <main className="flex-1 p-6" role="main">
          <ProjectDetailHeader
            id={project.id}
            name={project.name}
            type={project.type}
            isActive={project.isActive}
            description={project.description}
          />
          <ProjectSubNav slug={slug} type={project.type} />
          {children}
        </main>
      </div>
    </div>
  )
}

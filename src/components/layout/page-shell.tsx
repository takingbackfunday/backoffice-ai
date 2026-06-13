import { Sidebar } from './sidebar'
import { Header } from './header'
import { PageBreadcrumb, type BreadcrumbItem } from './page-breadcrumb'

export type { BreadcrumbItem }

interface PageShellProps {
  breadcrumb: BreadcrumbItem[]
  children: React.ReactNode
}

export function PageShell({ breadcrumb, children }: PageShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header>
          <PageBreadcrumb items={breadcrumb} />
        </Header>
        <main className="flex-1 p-6" role="main">
          {children}
        </main>
      </div>
    </div>
  )
}

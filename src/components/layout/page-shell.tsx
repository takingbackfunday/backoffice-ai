import { Sidebar } from './sidebar'
import { Header } from './header'
import { PageBreadcrumb, type BreadcrumbItem } from './page-breadcrumb'
import { contentWidthClass, type ContentWidth } from './content-width'

export type { BreadcrumbItem, ContentWidth }

interface PageShellProps {
  breadcrumb: BreadcrumbItem[]
  children: React.ReactNode
  contentWidth?: ContentWidth
}

export function PageShell({ breadcrumb, children, contentWidth }: PageShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header>
          <PageBreadcrumb items={breadcrumb} />
        </Header>
        <main className="flex-1 p-6" role="main">
          {contentWidth ? (
            <div className={contentWidthClass(contentWidth)}>
              {children}
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}

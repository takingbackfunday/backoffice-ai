'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, Users, Tag } from 'lucide-react'
import { PROJECT_TYPE_LABELS } from '@/types'
import { cn } from '@/lib/utils'
import { NewWorkOrderModal } from '@/components/work-orders/new-work-order-modal'
import { IntakeBillModal } from '@/components/work-orders/intake-bill-modal'

type ProjectType = 'CLIENT' | 'PROPERTY' | 'OTHER'

interface ProjectWithCounts {
  id: string
  name: string
  slug: string
  type: string
  description: string | null
  isActive: boolean
  createdAt: string
  _count: { transactions: number }
  clientProfile: { _count: { jobs: number } } | null
  propertyProfile: { _count: { units: number } } | null
}

interface Props {
  projects: ProjectWithCounts[]
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  CLIENT: Users,
  PROPERTY: Building2,
  OTHER: Tag,
}

const FILTERS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Clients', value: 'CLIENT' },
  { label: 'Properties', value: 'PROPERTY' },
  { label: 'Other', value: 'OTHER' },
]

export function ProjectList({ projects }: Props) {
  const [filter, setFilter] = useState<string | null>(null)
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false)
  const [showIntakeBillModal, setShowIntakeBillModal] = useState(false)

  const filtered = filter ? projects.filter(p => p.type === filter) : projects

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1">
          {FILTERS.map(f => (
            <button
              key={String(f.value)}
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filter === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowIntakeBillModal(true)}
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/30 transition-colors"
          >
            Intake bill
          </button>
          <button
            type="button"
            onClick={() => setShowNewWorkOrderModal(true)}
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/30 transition-colors"
          >
            New work order
          </button>
          <Link
            href="/projects/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            data-testid="add-project-btn"
          >
            New project
          </Link>
        </div>
      </div>

      {showNewWorkOrderModal && (
        <NewWorkOrderModal
          defaultType="PROPERTY"
          onClose={() => setShowNewWorkOrderModal(false)}
        />
      )}
      {showIntakeBillModal && (
        <IntakeBillModal
          onClose={() => setShowIntakeBillModal(false)}
        />
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tag className="h-10 w-10 mb-4 text-muted-foreground/40" />
          <p className="text-sm font-medium mb-1">No projects yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Create your first project to start organizing your finances.
          </p>
          <Link
            href="/projects/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Create project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(project => {
            const Icon = TYPE_ICONS[project.type] ?? Tag
            return (
              <Link
                key={project.id}
                href={`/projects/${project.slug}`}
                className="flex flex-col rounded-lg border p-4 hover:border-primary hover:bg-muted/20 transition-colors"
                data-testid={`project-card-${project.id}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{project.name}</span>
                  </div>
                  <span className="ml-2 shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {PROJECT_TYPE_LABELS[project.type] ?? project.type}
                  </span>
                </div>

                {project.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
                )}

                <div className="mt-auto pt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{project._count.transactions} transaction{project._count.transactions !== 1 ? 's' : ''}</span>
                  {project.type === 'CLIENT' && project.clientProfile && (
                    <span>{project.clientProfile._count.jobs} job{project.clientProfile._count.jobs !== 1 ? 's' : ''}</span>
                  )}
                  {project.type === 'PROPERTY' && project.propertyProfile && (
                    <span>{project.propertyProfile._count.units} unit{project.propertyProfile._count.units !== 1 ? 's' : ''}</span>
                  )}
                  {!project.isActive && (
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">Inactive</span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

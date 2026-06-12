'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type PipelineNode = {
  type: 'estimate' | 'quote' | 'invoice' | 'invoices'
  id: string
  label: string
  status?: string
  href: string
  meta?: string
}

interface Props {
  nodes: PipelineNode[]
  projectSlug: string
  currentId?: string
}

export function PipelineBreadcrumb({ nodes, projectSlug, currentId }: Props) {
  if (nodes.length === 0) return null

  return (
    <nav aria-label="Pipeline" className="flex items-center flex-wrap gap-1 text-xs text-muted-foreground">
      {nodes.map((node, i) => {
        const isCurrent = node.id === currentId
        const label = node.meta ? `${node.label} · ${node.meta}` : node.label
        return (
          <span key={`${node.type}-${node.id}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/60" />}
            {isCurrent ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link
                href={node.href.replace(`/projects/${projectSlug}/`, `/projects/${projectSlug}/`)}
                className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                {label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

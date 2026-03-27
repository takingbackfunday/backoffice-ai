'use client'

import { Building2, Users, Tag } from 'lucide-react'

const PROJECT_TYPES = [
  {
    type: 'CLIENT' as const,
    title: 'Client',
    icon: Users,
    description: 'Track work and finances for a freelance client or agency relationship.',
    features: ['Client contact details', 'Jobs & scopes of work', 'Billing rates & terms', 'Per-client P&L'],
  },
  {
    type: 'PROPERTY' as const,
    title: 'Property',
    icon: Building2,
    description: 'Manage a rental property with units, tenants, leases, and maintenance.',
    features: ['Unit tracking & status board', 'Tenant management & files', 'Lease tracking', 'Maintenance requests', 'Rent collection', 'Property P&L'],
  },
  {
    type: 'OTHER' as const,
    title: 'Other',
    icon: Tag,
    description: 'A simple project tag for grouping related transactions.',
    features: ['Transaction tagging', 'Basic financial tracking'],
  },
]

interface Props {
  onSelect: (type: 'CLIENT' | 'PROPERTY' | 'OTHER') => void
}

export function ProjectTypePicker({ onSelect }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3 max-w-4xl">
      {PROJECT_TYPES.map((pt) => (
        <button
          key={pt.type}
          onClick={() => onSelect(pt.type)}
          className="flex flex-col items-start rounded-lg border p-6 text-left hover:border-primary hover:bg-muted/50 transition-colors"
          data-testid={`project-type-${pt.type.toLowerCase()}`}
        >
          <pt.icon className="h-8 w-8 mb-3 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-1">{pt.title}</h3>
          <p className="text-sm text-muted-foreground mb-4">{pt.description}</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {pt.features.map((f) => (
              <li key={f} className="flex items-center gap-1.5">
                <span className="text-green-600">✓</span> {f}
              </li>
            ))}
          </ul>
        </button>
      ))}
    </div>
  )
}

import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/leases',
  title: 'Leases',
  purpose: 'List all leases for a property — see start/end dates, rent amounts, status, and tenant details.',
  jobsToBeDone: [
    'See all active, expired, and expiring-soon leases',
    'Check which leases are month-to-month',
    'View rent amount and lease term per lease',
    'Navigate to a unit or tenant from a lease record',
  ],
  deepLinks: {},
  reads: ['Lease', 'Tenant', 'Unit'],
  writes: ['Lease'],
  relatedRoutes: [
    '/projects/[slug]/units',
    '/projects/[slug]/tenants',
  ],
}

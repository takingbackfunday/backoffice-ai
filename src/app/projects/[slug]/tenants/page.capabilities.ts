import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/tenants',
  title: 'Tenants',
  purpose: 'List all tenants for a property — see contact info, unit assignment, and lease status.',
  jobsToBeDone: [
    'See all tenants and the unit each is assigned to',
    'Check which tenants have active, expiring, or ended leases',
    'Navigate to a tenant detail page',
    'Send a message to a tenant',
  ],
  deepLinks: {},
  reads: ['Tenant', 'Lease', 'Unit'],
  writes: ['Tenant'],
  relatedRoutes: [
    '/projects/[slug]/tenants/[tenantId]',
    '/projects/[slug]/messages',
    '/projects/[slug]/units',
  ],
}

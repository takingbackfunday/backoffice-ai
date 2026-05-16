import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/units',
  title: 'Units',
  purpose: 'Board view of all rental units in a property — see occupancy, current tenant, rent amount, and lease status.',
  jobsToBeDone: [
    'See which units are occupied, vacant, or expiring soon',
    'See the current tenant and rent amount per unit',
    'Add a new unit to the property',
    'Navigate to a unit to manage its lease or tenant',
  ],
  deepLinks: {},
  reads: ['Unit', 'Lease', 'Tenant', 'PropertyProfile'],
  writes: ['Unit'],
  relatedRoutes: [
    '/projects/[slug]/units/[unitId]',
    '/projects/[slug]/leases',
    '/projects/[slug]/tenants',
  ],
}

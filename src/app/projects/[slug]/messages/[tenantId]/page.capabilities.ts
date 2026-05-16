import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/messages/[tenantId]',
  title: 'Tenant conversation',
  purpose: 'Full message thread with a single tenant — send and receive messages.',
  jobsToBeDone: [
    'Read the full conversation history with a tenant',
    'Send a new message to this tenant',
    'See the tenant\'s unit and lease context alongside the conversation',
  ],
  deepLinks: {},
  reads: ['Tenant', 'Message', 'Lease', 'Unit'],
  writes: ['Message'],
  relatedRoutes: [
    '/projects/[slug]/messages',
    '/projects/[slug]/tenants/[tenantId]',
  ],
}

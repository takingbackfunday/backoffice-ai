import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/messages',
  title: 'Messages',
  purpose: 'Inbox of all tenant message threads for a property — see latest messages and navigate to individual conversations.',
  jobsToBeDone: [
    'See all tenant conversations in one place',
    'Identify which tenants have unread messages',
    'Start a new message thread with a tenant',
    'Navigate to a specific tenant conversation',
  ],
  deepLinks: {},
  reads: ['Tenant', 'Message'],
  writes: ['Message'],
  relatedRoutes: [
    '/projects/[slug]/messages/[tenantId]',
    '/projects/[slug]/tenants',
  ],
}

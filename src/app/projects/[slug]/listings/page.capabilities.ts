import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/listings',
  title: 'Listings',
  purpose: 'Manage rental listings for vacant units — create, publish, and track applicant enquiries.',
  jobsToBeDone: [
    'See all active and draft listings for this property',
    'Create a listing for a vacant unit',
    'Edit listing details (description, rent, photos)',
    'See applicant enquiries for a listing',
    'Publish or unpublish a listing',
  ],
  deepLinks: {},
  reads: ['Listing', 'PropertyProfile', 'Unit'],
  writes: ['Listing'],
  relatedRoutes: [
    '/projects/[slug]/units',
    '/projects/[slug]/tenants',
  ],
}

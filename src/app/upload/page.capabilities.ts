import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/upload',
  title: 'Upload transactions',
  purpose: 'Import bank transactions from a CSV file or PDF statement with AI-assisted column mapping.',
  jobsToBeDone: [
    'Drop a CSV file from any bank to import transactions',
    'Drop a PDF bank statement to extract and import transactions',
    'Use AI suggestions to map CSV columns to the right fields',
    'Preview which transactions will be imported and which are duplicates',
    'Trigger automatic categorisation via rules after import',
  ],
  deepLinks: {},
  reads: ['InstitutionSchema', 'CategorizationRule'],
  writes: ['Transaction', 'ImportBatch'],
  relatedRoutes: ['/transactions', '/rules'],
}

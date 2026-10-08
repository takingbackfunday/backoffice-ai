import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/upload',
  title: 'Import transactions',
  purpose: 'Import bank transactions from CSV, Excel or PDF statements, including separate debit and credit columns, with AI-assisted column mapping.',
  jobsToBeDone: [
    'Drop a CSV file from any bank to import transactions',
    'Drop a PDF bank statement to extract and import transactions',
    'Import a CSV or Excel statement with separate money-out and money-in columns',
    'Use AI suggestions to map CSV columns to the right fields',
    'Preview which transactions will be imported and which are duplicates',
    'Trigger automatic categorisation via rules after import',
  ],
  deepLinks: {},
  reads: ['InstitutionSchema', 'CategorizationRule'],
  writes: ['Transaction', 'ImportBatch'],
  relatedRoutes: ['/transactions', '/rules'],
}

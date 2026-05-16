import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/rules',
  title: 'Categorisation rules',
  purpose: 'Create and manage rules that auto-categorise transactions on import.',
  jobsToBeDone: [
    'Create, edit, delete, or reorder categorisation rules',
    'View and accept AI-suggested rules',
    'Run the AI rules agent to generate new suggestions',
    'See which categories and payees rules assign',
  ],
  deepLinks: {},
  reads: ['CategorizationRule', 'RuleSuggestion', 'Transaction', 'Category', 'Payee'],
  writes: ['CategorizationRule', 'RuleSuggestion'],
  relatedRoutes: ['/transactions'],
}

import type { PivotConfig } from './types'

export interface PivotPreset {
  name: string
  icon: string
  description: string
  config: Partial<PivotConfig>
}

export const PIVOT_PRESETS: PivotPreset[] = [
  {
    name: 'Tax Summary',
    icon: '📋',
    description: 'Tax type breakdown by quarter',
    config: {
      rows: ['taxType', 'category'],
      cols: ['quarter'],
      filterValues: {},
    },
  },
  {
    name: 'Category × Month',
    icon: '📂',
    description: 'Spending by category over time',
    config: {
      rows: ['categoryGroup', 'category'],
      cols: ['month'],
      filterValues: {},
    },
  },
  {
    name: 'Payee Breakdown',
    icon: '👤',
    description: 'Who you paid, by quarter',
    config: {
      rows: ['payee'],
      cols: ['quarter'],
      filterValues: {},
    },
  },
  {
    name: 'Account Summary',
    icon: '🏦',
    description: 'Per-account monthly totals',
    config: {
      rows: ['account'],
      cols: ['month'],
      filterValues: {},
    },
  },
  {
    name: 'Project P&L',
    icon: '📁',
    description: 'Income vs expense by project',
    config: {
      rows: ['project'],
      cols: ['type'],
      filterValues: {},
    },
  },
  {
    name: 'Expenses Only',
    icon: '💰',
    description: 'Expenses only, by category & month',
    config: {
      rows: ['categoryGroup', 'category'],
      cols: ['month'],
      filterValues: { type: ['Expense'] },
    },
  },
]

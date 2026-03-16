import type { Account, Project, Transaction, ImportBatch, InstitutionSchema, Category, CategoryGroup, Payee } from '@prisma/client'

// Re-export Prisma types for convenience
export type { Account, Project, Transaction, ImportBatch, InstitutionSchema, Category, CategoryGroup, Payee }

export type AccountType = 'CREDIT_CARD' | 'DEBIT_CARD' | 'CHECKING' | 'SAVINGS' | 'BUSINESS_CHECKING' | 'TRUST_ACCOUNT'
export type ProjectType = 'CLIENT' | 'PROPERTY' | 'JOB' | 'OTHER'

// CSV column mapping stored in InstitutionSchema.csvMapping
export interface CsvMapping {
  dateCol: string
  amountCol: string
  descCol: string
  dateFormat: string
  amountSign: 'normal' | 'inverted'
  merchantCol?: string
}

// Preview row shown before committing an import
export interface PreviewRow {
  date: string
  amount: number
  description: string
  merchantName?: string | null
  duplicateHash: string
  isDuplicate: boolean
  rawData: Record<string, string>
  // Populated by the rules engine on the server
  suggestedCategory: string | null
  suggestedCategoryId: string | null
  payeeId: string | null
  suggestionConfidence: 'high' | 'medium' | null
  matchedRuleId: string | null
}

// Upload wizard state shape
export interface UploadState {
  step: 'select-account' | 'upload' | 'map-columns' | 'preview' | 'done'
  accountId: string | null
  filename: string | null
  csvHeaders: string[]
  previewRows: PreviewRow[]
  totalRows: number
  duplicateCount: number
  csvText: string | null
}

// Paginated list meta
export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// Transaction with relations for display
export type TransactionWithRelations = Transaction & {
  account: Account & { institution: InstitutionSchema }
  project: Project | null
  categoryRef: (Category & { group: CategoryGroup }) | null
  payee: Payee | null
}

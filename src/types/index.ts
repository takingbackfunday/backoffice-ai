import type { Account, Workspace, Transaction, ImportBatch, InstitutionSchema, Category, CategoryGroup, Payee } from '@/generated/prisma/client'

// Re-export Prisma types for convenience
export type { Account, Workspace, Transaction, ImportBatch, InstitutionSchema, Category, CategoryGroup, Payee }
export type Project = Workspace  // backward compat alias

export type AccountType = 'CREDIT_CARD' | 'DEBIT_CARD' | 'CHECKING' | 'SAVINGS' | 'BUSINESS_CHECKING' | 'TRUST_ACCOUNT'
export type WorkspaceType = 'CLIENT' | 'PROPERTY' | 'OTHER'
export type ProjectType = WorkspaceType  // backward compat alias

// CSV column mapping stored in InstitutionSchema.csvMapping
export interface CsvMapping {
  dateCol: string
  amountCol: string
  descCol: string
  dateFormat: string
  amountSign: 'normal' | 'inverted'
  notesCol?: string
}

// Preview row shown before committing an import
export interface PreviewRow {
  date: string
  amount: number
  description: string
  notes?: string | null
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
  workspace: Workspace | null
  categoryRef: (Category & { group: CategoryGroup }) | null
  payee: Payee | null
}

export type { BankConnection } from '@/generated/prisma/client'
export type { NormalizedTransaction, NormalizedAccount, BankProviderAdapter, ConnectionInitResponse } from './bank-providers'

// === Projects expansion types ===

export type { ClientProfile, Job, PropertyProfile, Unit, Lease, Tenant, TenantFile, Message, MaintenanceRequest, Invoice, InvoiceLineItem, InvoicePayment } from '@/generated/prisma/client'

export type BillingType = 'HOURLY' | 'FIXED' | 'RETAINER' | 'MILESTONE'
export type JobStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type PropertyType = 'RESIDENTIAL' | 'MULTI_FAMILY' | 'COMMERCIAL' | 'MIXED_USE' | 'LAND'
export type UnitStatus = 'VACANT' | 'LEASED' | 'NOTICE_GIVEN' | 'PREPARING' | 'MAINTENANCE' | 'LISTED'
export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRING_SOON' | 'MONTH_TO_MONTH' | 'TERMINATED' | 'EXPIRED'
export type TenantFileType = 'LEASE_AGREEMENT' | 'ID_DOCUMENT' | 'PAY_STUB' | 'CREDIT_REPORT' | 'INSPECTION_REPORT' | 'MOVE_IN_PHOTOS' | 'MOVE_OUT_PHOTOS' | 'INSURANCE' | 'OTHER'
export type ChargeType = 'RENT' | 'LATE_FEE' | 'MAINTENANCE' | 'UTILITY' | 'DEPOSIT' | 'OTHER'
export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'
export type MaintenanceStatus = 'OPEN' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  CLIENT: 'Client',
  PROPERTY: 'Property',
  OTHER: 'Other',
}

export const UNIT_STATUS_LABELS: Record<string, string> = {
  VACANT: 'Vacant',
  LEASED: 'Leased',
  NOTICE_GIVEN: 'Notice given',
  PREPARING: 'Preparing',
  MAINTENANCE: 'Maintenance',
  LISTED: 'Listed',
}

export const UNIT_STATUS_COLORS: Record<string, string> = {
  VACANT: 'bg-amber-100 text-amber-800',
  LEASED: 'bg-green-100 text-green-800',
  NOTICE_GIVEN: 'bg-orange-100 text-orange-800',
  PREPARING: 'bg-blue-100 text-blue-800',
  MAINTENANCE: 'bg-red-100 text-red-800',
  LISTED: 'bg-purple-100 text-purple-800',
}

export const LEASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring soon',
  MONTH_TO_MONTH: 'Month-to-month',
  TERMINATED: 'Terminated',
  EXPIRED: 'Expired',
}

export const LEASE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  EXPIRING_SOON: 'bg-amber-100 text-amber-800',
  MONTH_TO_MONTH: 'bg-blue-100 text-blue-800',
  TERMINATED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-600',
}

export const MAINTENANCE_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  EMERGENCY: 'Emergency',
}

export const MAINTENANCE_PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-800',
  MEDIUM: 'bg-blue-100 text-blue-800',
  HIGH: 'bg-orange-100 text-orange-800',
  EMERGENCY: 'bg-red-100 text-red-800',
}

export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const BILLING_TYPE_LABELS: Record<string, string> = {
  HOURLY: 'Hourly',
  FIXED: 'Fixed price',
  RETAINER: 'Retainer',
  MILESTONE: 'Milestone',
}

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: 'Residential',
  MULTI_FAMILY: 'Multi-family',
  COMMERCIAL: 'Commercial',
  MIXED_USE: 'Mixed use',
  LAND: 'Land',
}

export const CHARGE_TYPE_LABELS: Record<string, string> = {
  RENT: 'Rent',
  LATE_FEE: 'Late fee',
  MAINTENANCE: 'Maintenance',
  UTILITY: 'Utility',
  DEPOSIT: 'Deposit',
  OTHER: 'Other',
}

export const CHARGE_TYPE_COLORS: Record<string, string> = {
  RENT: 'bg-blue-100 text-blue-800',
  LATE_FEE: 'bg-red-100 text-red-800',
  MAINTENANCE: 'bg-orange-100 text-orange-800',
  UTILITY: 'bg-cyan-100 text-cyan-800',
  DEPOSIT: 'bg-purple-100 text-purple-800',
  OTHER: 'bg-gray-100 text-gray-700',
}

// === Invoice types ===

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID'

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
}

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  PAID: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
  VOID: 'bg-gray-100 text-gray-400',
}

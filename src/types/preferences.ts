import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'
import type { PivotConfig } from '@/lib/pivot/types'

export interface InvoiceDefaults {
  taxEnabled?: boolean
  taxLabel?: string
  taxMode?: 'percent' | 'flat'
  taxRate?: string
  currency?: string
  notes?: string
}

export interface UserPreferenceData {
  // Business identity
  businessName?: string
  yourName?: string
  displayName?: string
  businessType?: string

  // Invoice sender details
  fromEmail?: string
  fromPhone?: string
  fromAddress?: string
  fromVatNumber?: string
  fromWebsite?: string

  // Invoice settings
  paymentMethods?: PaymentMethods
  invoicePaymentNote?: string
  invoiceDefaults?: InvoiceDefaults

  // Quote settings
  quoteValidityDays?: number
  quoteTerms?: string

  // Dashboard display currency
  dashboardCurrency?: 'USD' | 'EUR' | 'GBP'

  // Internal / system
  lastRulesAgentRun?: number
  onboardingStep?: string

  // Pivot table
  pivotConfig?: Partial<PivotConfig>
}

export function parsePreferences(raw: unknown): UserPreferenceData {
  return (raw ?? {}) as UserPreferenceData
}

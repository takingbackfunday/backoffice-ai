import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

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

  // Internal / system
  lastRulesAgentRun?: number
  onboardingStep?: string
}

export function parsePreferences(raw: unknown): UserPreferenceData {
  return (raw ?? {}) as UserPreferenceData
}

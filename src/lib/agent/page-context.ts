export interface SerializableLineItem {
  id: string
  description: string
  quantity: string
  qtyUnit: string
  unitPrice: string
  isTaxLine: boolean
}

export interface SerializableSectionItem {
  description: string
  quantity: string
  qtyUnit: string
  unitPrice?: string
  costRate?: string
  tags?: string
  isOptional?: boolean
}

export interface SerializableSection {
  name: string
  items: SerializableSectionItem[]
}

export interface SerializableQuoteItemPrice {
  description: string
  unitPrice: number
}

export type EditorAction =
  | { type: 'set_line_items'; lineItems: SerializableLineItem[] }
  | { type: 'set_tax'; label: string; amount: number }
  | { type: 'set_due_date'; value: string }
  | { type: 'set_notes'; value: string }
  | { type: 'set_currency'; value: string }
  // quote-specific (includes sections/scope editing)
  | { type: 'set_sections'; sections: SerializableSection[] }
  | { type: 'set_title'; value: string }
  | { type: 'set_item_prices'; items: SerializableQuoteItemPrice[] }
  | { type: 'set_quote_terms'; value: string }
  | { type: 'set_valid_until'; value: string }

export type EditorActionDispatcher = (action: EditorAction) => void

export interface PageContext {
  pathname: string
  routeTemplate: string | null
  entityType?: 'invoice' | 'quote' | 'transaction' | 'project' | 'tenant' | 'vendor' | 'applicant' | 'unit'
  entityId?: string
  entityName?: string
  snapshot?: Record<string, unknown>
  dispatch?: EditorActionDispatcher  // never serialized or sent to the server
}

// Strip dispatch before including in API request body
export type SerializablePageContext = Omit<PageContext, 'dispatch'>

export interface SerializableLineItem {
  id: string
  description: string
  quantity: string
  qtyUnit: string
  unitPrice: string
  isTaxLine: boolean
}

export type EditorAction =
  | { type: 'set_line_items'; lineItems: SerializableLineItem[] }
  | { type: 'set_tax'; label: string; amount: number }
  | { type: 'set_due_date'; value: string }
  | { type: 'set_notes'; value: string }
  | { type: 'set_currency'; value: string }

export type EditorActionDispatcher = (action: EditorAction) => void

export interface PageContext {
  pathname: string
  routeTemplate: string | null
  entityType?: 'invoice' | 'estimate' | 'quote' | 'transaction' | 'project' | 'tenant' | 'vendor' | 'applicant' | 'unit'
  entityId?: string
  entityName?: string
  snapshot?: Record<string, unknown>
  dispatch?: EditorActionDispatcher  // never serialized or sent to the server
}

// Strip dispatch before including in API request body
export type SerializablePageContext = Omit<PageContext, 'dispatch'>

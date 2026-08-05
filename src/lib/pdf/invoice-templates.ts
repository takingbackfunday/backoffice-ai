export type InvoiceTemplateId =
  | 'top-left' | 'top-center' | 'top-right' | 'banner' | 'inline' | 'footer-logo'

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateId = 'top-left'

export const INVOICE_TEMPLATES: { id: InvoiceTemplateId; label: string; blurb: string }[] = [
  { id: 'top-left',    label: 'Classic',       blurb: 'Logo above your details, title on the right' },
  { id: 'top-center',  label: 'Centered',      blurb: 'Logo and details centered at the top' },
  { id: 'top-right',   label: 'Right-aligned', blurb: 'Logo top-right, title on the left' },
  { id: 'banner',      label: 'Banner',        blurb: 'Full-width band with your logo and name' },
  { id: 'inline',      label: 'Compact',       blurb: 'Logo and name side by side in one row' },
  { id: 'footer-logo', label: 'Footer logo',   blurb: 'Text-only header, logo pinned in the footer' },
]

export function isInvoiceTemplateId(v: unknown): v is InvoiceTemplateId {
  return typeof v === 'string' && INVOICE_TEMPLATES.some(t => t.id === v)
}

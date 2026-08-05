import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/settings',
  title: 'Settings',
  purpose: 'Manage user preferences, business info, payment methods, invoice templates, and invoice defaults with a live preview.',
  jobsToBeDone: [
    'Change business name, address, email, phone, VAT number, or website',
    'Add or edit payment methods (bank transfer, PayPal, Stripe, custom)',
    'Set default text for invoice notes and payment instructions',
    'Choose an invoice template (logo placement) and toggle the text business name',
    'Configure margin rules used in quote generation',
  ],
  deepLinks: {
    'business-name': '#business-name',
    'business-address': '#business-address',
    'invoice-template': '#invoice-template',
    'invoice-notes-default': '#invoice-notes-default',
    'payment-instructions': '#payment-instructions',
    'payment-methods': '#payment-methods',
    'margin-rules': '#margin-rules',
  },
  reads: ['UserPreference', 'MarginRule'],
  writes: ['UserPreference', 'MarginRule'],
  relatedRoutes: ['/projects/[slug]/invoices/new', '/projects/[slug]/estimates/new'],
}

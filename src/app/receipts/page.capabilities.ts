import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/receipts',
  title: 'Receipts',
  purpose: 'Upload and OCR receipts — automatically extracts vendor, amount, date, and tax.',
  jobsToBeDone: [
    'Upload a receipt image or PDF for OCR processing',
    'View extracted receipt data (vendor, amount, date, tax)',
    'Link a receipt to a matching bank transaction',
    'Retry failed OCR processing',
    'Delete or edit receipt records',
  ],
  deepLinks: {},
  reads: ['Receipt', 'Transaction'],
  writes: ['Receipt'],
  relatedRoutes: ['/transactions'],
}

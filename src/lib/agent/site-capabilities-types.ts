export interface PageCapability {
  route: string                          // Next.js dynamic-segment template, e.g. '/projects/[slug]/invoices/[invoiceId]/edit'
  title: string                          // user-facing page title
  purpose: string                        // one sentence
  jobsToBeDone: string[]                 // natural-language tasks the user performs here
  deepLinks: Record<string, string>      // { 'business-address': '#business-address' }
  reads: string[]                        // Prisma model names this page reads
  writes: string[]                       // Prisma model names this page writes
  editorContext?: 'invoice' | 'estimate' | 'quote' // if set, omni can drive the editor via apply_*_edits
  relatedRoutes?: string[]               // other routes worth suggesting after this one
  hidden?: boolean                       // exclude from omni (e.g. public apply/sign pages)
}

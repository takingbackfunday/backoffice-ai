import { createUploadthing, type FileRouter } from 'uploadthing/next'

const f = createUploadthing()

export const ourFileRouter = {
  // Used by the application form (inline upload at apply time)
  applicantDocUploader: f({ pdf: { maxFileSize: '16MB', maxFileCount: 1 } })
    .middleware(async () => {
      // Public route — no auth. Token validation happens in the submit handler.
      return {}
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl }
    }),

  // Used by the ad-hoc upload page (/apply/docs/[token])
  adHocDocUploader: f({ pdf: { maxFileSize: '16MB', maxFileCount: 1 } })
    .middleware(async () => {
      return {}
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl }
    }),

  // Receipt thumbnail (compressed WebP, max 2MB — actual size ~30-120KB)
  receiptThumbnail: f({ image: { maxFileSize: '2MB', maxFileCount: 1 } })
    .middleware(async () => {
      // Auth is checked in the API route before calling upload.
      // UploadThing middleware runs server-side, so we re-check.
      const { auth: clerkAuth } = await import('@clerk/nextjs/server')
      const { userId } = await clerkAuth()
      if (!userId) throw new Error('Unauthorized')
      return { userId }
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl }
    }),

  // Vendor documents: W9, insurance certs, contracts (PDF only)
  vendorDocument: f({ pdf: { maxFileSize: '16MB', maxFileCount: 1 } })
    .middleware(async () => {
      const { auth: clerkAuth } = await import('@clerk/nextjs/server')
      const { userId } = await clerkAuth()
      if (!userId) throw new Error('Unauthorized')
      return { userId }
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl }
    }),

  // Vendor bill / invoice PDF
  billPdf: f({ pdf: { maxFileSize: '16MB', maxFileCount: 1 } })
    .middleware(async () => {
      const { auth: clerkAuth } = await import('@clerk/nextjs/server')
      const { userId } = await clerkAuth()
      if (!userId) throw new Error('Unauthorized')
      return { userId }
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl }
    }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter

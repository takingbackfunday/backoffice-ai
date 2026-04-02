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
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter

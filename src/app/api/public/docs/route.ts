import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, notFound, serverError } from '@/lib/api-response'
import { verifyDocToken } from '@/lib/doc-token'

const UploadSchema = z.object({
  token: z.string().min(1),
  fileUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().optional(),
})

// GET /api/public/docs?token=... — verify token and return document metadata
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    if (!token) return badRequest('Missing token')

    const verified = verifyDocToken(token)
    if (!verified) return badRequest('Invalid or expired link')

    const doc = await prisma.applicantDocument.findUnique({
      where: { id: verified.documentId },
      include: {
        applicant: { select: { name: true, email: true } },
      },
    })
    if (!doc) return notFound('Document request not found')
    if (doc.status === 'uploaded') return badRequest('Document already uploaded')
    if (!doc.uploadToken || doc.uploadToken !== token) return badRequest('Invalid token')

    return ok({
      documentId: doc.id,
      fileType: doc.fileType,
      requestLabel: doc.requestLabel,
      applicantName: doc.applicant.name,
    })
  } catch {
    return serverError('Failed to verify token')
  }
}

// POST /api/public/docs — save uploaded file URL against the document request
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = UploadSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const verified = verifyDocToken(parsed.data.token)
    if (!verified) return badRequest('Invalid or expired link')

    const doc = await prisma.applicantDocument.findUnique({
      where: { id: verified.documentId },
    })
    if (!doc) return notFound('Document request not found')
    if (doc.status === 'uploaded') return badRequest('Document already uploaded')
    if (!doc.uploadToken || doc.uploadToken !== parsed.data.token) return badRequest('Invalid token')

    const updated = await prisma.applicantDocument.update({
      where: { id: doc.id },
      data: {
        status: 'uploaded',
        fileUrl: parsed.data.fileUrl,
        fileName: parsed.data.fileName,
        fileSize: parsed.data.fileSize ?? null,
        uploadedBy: 'applicant',
        uploadToken: null, // consume the token
        tokenExpiresAt: null,
      },
    })

    return ok({ id: updated.id, status: updated.status, fileName: updated.fileName })
  } catch {
    return serverError('Failed to save document')
  }
}

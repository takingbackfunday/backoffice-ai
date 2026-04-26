import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateDocSchema = z.object({
  fileType: z.enum(['W9', 'INSURANCE_CERT', 'CONTRACT', 'OTHER']),
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
  fileSize: z.number().int().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().optional(),
})

interface RouteParams { params: Promise<{ vendorId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { vendorId } = await params
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId } })
    if (!vendor) return notFound('Vendor not found')
    const body = await request.json()
    const parsed = CreateDocSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    const doc = await prisma.vendorDocument.create({
      data: {
        vendorId,
        fileType: parsed.data.fileType,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        fileSize: parsed.data.fileSize ?? null,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        notes: parsed.data.notes ?? null,
        uploadedBy: userId,
      },
    })
    return created(doc)
  } catch {
    return serverError('Failed to upload vendor document')
  }
}

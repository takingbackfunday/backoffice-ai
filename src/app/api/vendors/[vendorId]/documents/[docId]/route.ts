import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ vendorId: string; docId: string }> }

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { vendorId, docId } = await params
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId } })
    if (!vendor) return notFound('Vendor not found')
    const doc = await prisma.vendorDocument.findFirst({ where: { id: docId, vendorId } })
    if (!doc) return notFound('Document not found')
    await prisma.vendorDocument.delete({ where: { id: docId } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete document')
  }
}

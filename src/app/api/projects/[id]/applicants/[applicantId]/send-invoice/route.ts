import { auth, clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { sendInvoiceEmail } from '@/lib/email'

interface RouteParams { params: Promise<{ id: string; applicantId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, applicantId } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const applicant = await prisma.applicant.findFirst({
      where: { id: applicantId, propertyProfileId: project.propertyProfile.id },
    })
    if (!applicant) return notFound('Applicant not found')

    const invoice = await prisma.invoice.findFirst({
      where: { applicantId },
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!invoice) return badRequest('No invoice found for this applicant')

    const total = invoice.lineItems.reduce(
      (sum, li) => sum + Number(li.unitPrice) * Number(li.quantity),
      0
    )

    // Get owner name for the email
    let fromName = project.name
    try {
      const clerk = await clerkClient()
      const user = await clerk.users.getUser(userId)
      fromName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || project.name
    } catch { /* fall back to project name */ }

    await sendInvoiceEmail({
      toEmail: applicant.email,
      toName: applicant.name,
      fromName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      projectSlug: project.slug,
      total,
      currency: invoice.currency,
      dueDate: invoice.dueDate.toISOString(),
      notes: invoice.notes,
    })

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'SENT', sentAt: new Date(), sentTo: applicant.email },
      include: { lineItems: true },
    })

    return ok(updated)
  } catch {
    return serverError('Failed to send invoice')
  }
}

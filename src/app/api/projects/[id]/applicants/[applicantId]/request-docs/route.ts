import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { generateDocToken } from '@/lib/doc-token'
import { docTypeLabel } from '@/lib/doc-types'
import { Resend } from 'resend'

const RequestSchema = z.object({
  requests: z.array(z.object({
    fileType: z.string().min(1),
    requestLabel: z.string().optional(), // required when fileType === 'other'
  })).min(1),
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'
const FROM = process.env.RESEND_FROM ?? 'Backoffice <noreply@backoffice.cv>'

interface RouteParams { params: Promise<{ id: string; applicantId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, applicantId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property not found')

    const applicant = await prisma.applicant.findFirst({
      where: { id: applicantId, propertyProfileId: project.propertyProfile.id },
    })
    if (!applicant) return notFound('Applicant not found')

    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    // Create a "requested" document row for each requested type
    const created = await Promise.all(
      parsed.data.requests.map(async ({ fileType, requestLabel }) => {
        const doc = await prisma.applicantDocument.create({
          data: {
            applicantId,
            fileType,
            requestLabel: requestLabel ?? null,
            status: 'requested',
            uploadedBy: userId,
          },
        })
        const token = generateDocToken(doc.id)
        return prisma.applicantDocument.update({
          where: { id: doc.id },
          data: {
            uploadToken: token,
            tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        })
      })
    )

    // Send one email with all the upload links
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const resend = new Resend(resendKey)
      const docItems = created
        .map(doc => {
          const label = docTypeLabel(doc.fileType, doc.requestLabel)
          const link = `${APP_URL}/apply/docs/${doc.uploadToken}`
          return `<li style="margin-bottom:10px"><strong>${label}</strong><br><a href="${link}" style="color:#3C3489">${link}</a></li>`
        })
        .join('')

      await resend.emails.send({
        from: FROM,
        to: applicant.email,
        subject: `Document request from ${project.name}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="font-size:18px;margin-bottom:8px">Documents requested</h2>
            <p style="color:#555;font-size:14px;margin-bottom:20px">
              ${project.name} has requested the following documents from you.
              Please upload each document using the secure link provided. Links expire in 7 days.
            </p>
            <ul style="padding-left:20px;font-size:14px">${docItems}</ul>
            <p style="font-size:12px;color:#888;margin-top:24px">PDF files only, max 10MB each.</p>
          </div>
        `,
      }).catch(() => { /* non-fatal */ })
    }

    return ok(created.map(d => ({ id: d.id, fileType: d.fileType, requestLabel: d.requestLabel, status: d.status })))
  } catch {
    return serverError('Failed to request documents')
  }
}

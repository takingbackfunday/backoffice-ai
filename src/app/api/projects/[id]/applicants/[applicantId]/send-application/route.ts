import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { sendApplicationLink } from '@/lib/email'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

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
      include: {
        listing: { select: { publicSlug: true, title: true } },
      },
    })
    if (!applicant) return notFound('Applicant not found')

    if (!applicant.listing) {
      return badRequest('This applicant has no listing associated — share the application URL manually.')
    }

    const applicationUrl = `${APP_URL}/apply/${applicant.listing.publicSlug}/application`

    await sendApplicationLink({
      toEmail: applicant.email,
      toName: applicant.name,
      propertyName: project.name,
      listingTitle: applicant.listing.title,
      applicationUrl,
    })

    // Advance status to APPLICATION_SENT if still at INQUIRY
    let updated = applicant
    if (applicant.status === 'INQUIRY') {
      updated = await prisma.applicant.update({
        where: { id: applicantId },
        data: { status: 'APPLICATION_SENT' },
        include: {
          unit: { select: { id: true, unitLabel: true } },
          listing: { select: { id: true, publicSlug: true, title: true } },
          convertedToTenant: { select: { id: true, name: true, email: true } },
        },
      })
    }

    return ok({ sent: true, status: updated.status })
  } catch {
    return serverError('Failed to send application link')
  }
}

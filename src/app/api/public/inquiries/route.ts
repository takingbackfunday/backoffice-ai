import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, notFound, serverError } from '@/lib/api-response'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendInquiryConfirmation, sendInquiryNotificationToOwner } from '@/lib/email'
import { clerkClient } from '@clerk/nextjs/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

const InquirySchema = z.object({
  listingSlug: z.string().min(1),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  desiredMoveIn: z.string().optional(),
  message: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown'

    if (!checkRateLimit(`inquiry:${ip}`, 10, 60 * 60 * 1000)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()
    const parsed = InquirySchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const listing = await prisma.listing.findFirst({
      where: { publicSlug: parsed.data.listingSlug, isActive: true },
      include: {
        unit: {
          include: {
            propertyProfile: {
              include: { workspace: { select: { id: true, name: true, slug: true } } },
            },
          },
        },
      },
    })
    if (!listing) return notFound('Listing not found')

    const applicant = await prisma.applicant.create({
      data: {
        userId: listing.userId,
        propertyProfileId: listing.unit.propertyProfileId,
        unitId: listing.unitId,
        listingId: listing.id,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        desiredMoveIn: parsed.data.desiredMoveIn ? new Date(parsed.data.desiredMoveIn) : undefined,
        status: 'INQUIRY',
        source: 'listing',
        notes: parsed.data.message,
      },
    })

    // Send emails (fire-and-forget safe via Promise.allSettled)
    const clerk = await clerkClient()
    const owner = await clerk.users.getUser(listing.userId).catch(() => null)
    const ownerEmail = owner?.emailAddresses[0]?.emailAddress
    const ownerName = owner?.firstName ?? 'Property Manager'
    const propertyName = listing.unit.propertyProfile.workspace.name
    const unitLabel = listing.unit.unitLabel
    const pipelineUrl = `${APP_URL}/projects/${listing.unit.propertyProfile.workspace.slug}/tenants`

    await Promise.allSettled([
      sendInquiryConfirmation({
        toEmail: parsed.data.email,
        toName: parsed.data.name,
        propertyName,
        unitLabel,
        ownerName,
      }),
      ownerEmail
        ? sendInquiryNotificationToOwner({
            toEmail: ownerEmail,
            ownerName,
            applicantName: parsed.data.name,
            applicantEmail: parsed.data.email,
            applicantPhone: parsed.data.phone ?? null,
            propertyName,
            unitLabel,
            message: parsed.data.message ?? null,
            pipelineUrl,
          })
        : Promise.resolve(),
    ])

    return ok({ id: applicant.id, name: applicant.name, email: applicant.email })
  } catch {
    return serverError('Failed to submit inquiry')
  }
}

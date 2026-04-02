import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, notFound, serverError } from '@/lib/api-response'
import { checkRateLimit } from '@/lib/rate-limit'

const UploadedDocSchema = z.object({
  fileType: z.string().min(1),
  fileUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().optional(),
})

const ApplicationSchema = z.object({
  listingSlug: z.string().min(1),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  desiredMoveIn: z.string().optional(),
  screeningConsent: z.literal(true, { errorMap: () => ({ message: 'Screening consent is required' }) }),
  applicationData: z.object({}).passthrough(),
  uploadedDocs: z.array(UploadedDocSchema).optional(),
})

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown'

    if (!checkRateLimit(`application:${ip}`, 5, 60 * 60 * 1000)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()
    const parsed = ApplicationSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const listing = await prisma.listing.findFirst({
      where: { publicSlug: parsed.data.listingSlug, isActive: true },
      include: {
        unit: { select: { id: true, propertyProfileId: true } },
      },
    })
    if (!listing) return notFound('Listing not found')

    // Upsert: check if applicant with same email already exists for this property
    const existing = await prisma.applicant.findFirst({
      where: {
        propertyProfileId: listing.unit.propertyProfileId,
        email: parsed.data.email,
      },
    })

    const appData = parsed.data.applicationData as Record<string, unknown>
    const employment = appData.employment as Record<string, string> | undefined

    const applicantData = {
      name: parsed.data.name,
      status: 'APPLIED' as const,
      applicationData: parsed.data.applicationData,
      screeningConsentAt: new Date(),
      screeningConsentIp: ip === 'unknown' ? undefined : ip,
      desiredMoveIn: parsed.data.desiredMoveIn ? new Date(parsed.data.desiredMoveIn) : undefined,
      currentEmployer: employment?.currentEmployer,
      annualIncome: employment?.annualIncome ? parseFloat(employment.annualIncome) : undefined,
      phone: parsed.data.phone,
      listingId: listing.id,
      unitId: listing.unitId,
    }

    let applicant
    if (existing) {
      applicant = await prisma.applicant.update({
        where: { id: existing.id },
        data: applicantData,
      })
    } else {
      applicant = await prisma.applicant.create({
        data: {
          userId: listing.userId,
          propertyProfileId: listing.unit.propertyProfileId,
          email: parsed.data.email,
          source: 'listing',
          ...applicantData,
        },
      })
    }

    // Save uploaded documents as ApplicantDocument rows
    if (parsed.data.uploadedDocs && parsed.data.uploadedDocs.length > 0) {
      // Delete any previously uploaded docs for this applicant (re-submission)
      await prisma.applicantDocument.deleteMany({
        where: { applicantId: applicant.id, status: 'uploaded', uploadedBy: 'applicant' },
      })
      await prisma.applicantDocument.createMany({
        data: parsed.data.uploadedDocs.map(doc => ({
          applicantId: applicant.id,
          fileType: doc.fileType,
          fileUrl: doc.fileUrl,
          fileName: doc.fileName,
          fileSize: doc.fileSize ?? null,
          status: 'uploaded',
          uploadedBy: 'applicant',
        })),
      })
    }

    // Auto-create application fee invoice if listing has fees and no invoice exists yet
    const hasFees = (listing.applicationFee && Number(listing.applicationFee) > 0) ||
                    (listing.screeningFee && Number(listing.screeningFee) > 0)

    if (hasFees) {
      const existingInvoice = await prisma.invoice.findFirst({
        where: { applicantId: applicant.id },
      })

      if (!existingInvoice) {
        const invoiceNumber = `APP-${Date.now().toString(36).toUpperCase()}`
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + 7)

        const lineItems = []
        if (listing.applicationFee && Number(listing.applicationFee) > 0) {
          lineItems.push({
            description: 'Application Fee',
            quantity: 1,
            unitPrice: Number(listing.applicationFee),
            chargeType: 'OTHER',
          })
        }
        if (listing.screeningFee && Number(listing.screeningFee) > 0) {
          lineItems.push({
            description: 'Screening Fee',
            quantity: 1,
            unitPrice: Number(listing.screeningFee),
            chargeType: 'OTHER',
          })
        }

        await prisma.invoice.create({
          data: {
            applicantId: applicant.id,
            invoiceNumber,
            status: 'DRAFT',
            issueDate: new Date(),
            dueDate,
            currency: 'USD',
            notes: `Application fees for ${listing.title}`,
            lineItems: { create: lineItems },
          },
        })
      }
    }

    return ok({ id: applicant.id, status: applicant.status })
  } catch {
    return serverError('Failed to submit application')
  }
}

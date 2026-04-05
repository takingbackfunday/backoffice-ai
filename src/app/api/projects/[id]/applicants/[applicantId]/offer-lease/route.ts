import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { generateLeaseContractPdf } from '@/lib/pdf/lease-contract-pdf'
import { sendLeaseContractEmail } from '@/lib/email'
import { randomUUID } from 'node:crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

const AdditionalChargeSchema = z.object({
  label: z.string().min(1),
  amount: z.number().min(0),
  frequency: z.enum(['monthly', 'one_time']),
})

const LeaseRulesSchema = z.object({
  smokingAllowed: z.boolean().optional(),
  sublettingAllowed: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
  petNotes: z.string().optional(),
  parkingStall: z.string().optional(),
  parkingFee: z.number().optional(),
  storageUnit: z.string().optional(),
  storageFee: z.number().optional(),
  guestPolicy: z.string().optional(),
}).optional().default({})

const OfferLeaseSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  monthlyRent: z.number().min(0, 'Monthly rent must be non-negative'),
  securityDeposit: z.number().optional(),
  paymentDueDay: z.number().int().min(1).max(31).optional().default(1),
  lateFeeAmount: z.number().optional(),
  lateFeeGraceDays: z.number().int().optional().default(5),
  currency: z.string().optional().default('USD'),
  contractNotes: z.string().optional(),
  additionalCharges: z.array(AdditionalChargeSchema).optional().default([]),
  utilitiesIncluded: z.array(z.string()).optional().default([]),
  leaseRules: LeaseRulesSchema,
})

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
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const applicant = await prisma.applicant.findFirst({
      where: { id: applicantId, propertyProfileId: project.propertyProfile.id },
    })
    if (!applicant) return notFound('Applicant not found')
    if (applicant.status !== 'APPROVED') return badRequest('Applicant must be APPROVED to receive a lease offer')
    if (!applicant.unitId) return badRequest('Applicant must have a unit assigned')

    const body = await request.json()
    const parsed = OfferLeaseSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
    const ownerName = (prefsData.displayName as string | undefined) ?? 'Property Manager'

    const unit = await prisma.unit.findUnique({ where: { id: applicant.unitId } })
    if (!unit) return notFound('Unit not found')

    const signingToken = randomUUID()

    const result = await prisma.$transaction(async (tx) => {
      // Create or reuse tenant
      let tenantId = applicant.convertedToTenantId
      if (!tenantId) {
        const existing = await tx.tenant.findFirst({ where: { userId, email: applicant.email } })
        if (existing) {
          tenantId = existing.id
        } else {
          const tenant = await tx.tenant.create({
            data: { userId, name: applicant.name, email: applicant.email, phone: applicant.phone ?? undefined },
          })
          tenantId = tenant.id
        }
        await tx.applicant.update({
          where: { id: applicantId },
          data: { convertedToTenantId: tenantId, convertedAt: new Date() },
        })
      }

      const lease = await tx.lease.create({
        data: {
          unitId: applicant.unitId!,
          tenantId,
          applicantId,
          startDate: new Date(parsed.data.startDate),
          endDate: new Date(parsed.data.endDate),
          monthlyRent: parsed.data.monthlyRent,
          securityDeposit: parsed.data.securityDeposit,
          paymentDueDay: parsed.data.paymentDueDay,
          lateFeeAmount: parsed.data.lateFeeAmount,
          lateFeeGraceDays: parsed.data.lateFeeGraceDays,
          currency: parsed.data.currency,
          contractNotes: parsed.data.contractNotes,
          additionalCharges: parsed.data.additionalCharges,
          utilitiesIncluded: parsed.data.utilitiesIncluded,
          leaseRules: parsed.data.leaseRules,
          status: 'DRAFT',
          contractStatus: 'SENT',
          contractSentAt: new Date(),
          signingToken,
        },
        include: { tenant: true, unit: true },
      })

      await tx.applicant.update({
        where: { id: applicantId },
        data: { status: 'LEASE_OFFERED' },
      })

      return lease
    })

    // Generate PDF and email
    try {
      const contractData = {
        ownerName,
        tenantName: result.tenant.name,
        tenantEmail: result.tenant.email,
        tenantPhone: result.tenant.phone ?? null,
        propertyName: project.name,
        propertyAddress: project.propertyProfile.address ?? null,
        unitLabel: result.unit.unitLabel,
        startDate: result.startDate.toISOString(),
        endDate: result.endDate.toISOString(),
        monthlyRent: Number(result.monthlyRent),
        securityDeposit: result.securityDeposit ? Number(result.securityDeposit) : null,
        currency: result.currency ?? 'USD',
        paymentDueDay: result.paymentDueDay ?? 1,
        lateFeeAmount: result.lateFeeAmount ? Number(result.lateFeeAmount) : null,
        lateFeeGraceDays: result.lateFeeGraceDays ?? 5,
        contractNotes: result.contractNotes ?? null,
        additionalCharges: (result.additionalCharges as { label: string; amount: number; frequency: string }[]) ?? [],
        utilitiesIncluded: (result.utilitiesIncluded as string[]) ?? [],
        leaseRules: (result.leaseRules as Record<string, unknown>) ?? {},
        generatedAt: new Date().toISOString(),
      }
      const pdfBuffer = await generateLeaseContractPdf(contractData)
      const signingLink = `${APP_URL}/sign/${signingToken}`

      await sendLeaseContractEmail({
        toEmail: result.tenant.email,
        toName: result.tenant.name,
        fromName: ownerName,
        propertyName: project.name,
        unitLabel: result.unit.unitLabel,
        startDate: result.startDate.toISOString(),
        endDate: result.endDate.toISOString(),
        pdfBuffer,
        signingLink,
      })
    } catch {
      // Email failure is non-fatal
    }

    return ok({ lease: result, applicant: { id: applicantId, status: 'LEASE_OFFERED' } })
  } catch {
    return serverError('Failed to offer lease')
  }
}

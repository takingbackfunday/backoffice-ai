import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, notFound, serverError } from '@/lib/api-response'

const LeaseSignSchema = z.object({
  token: z.string().min(1),
  signatureName: z.string().min(2, 'Signature name must be at least 2 characters'),
  agreed: z.literal(true, { errorMap: () => ({ message: 'You must agree to the lease terms' }) }),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = LeaseSignSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const lease = await prisma.lease.findFirst({
      where: {
        signingToken: parsed.data.token,
        contractStatus: { in: ['SENT', 'READY'] },
      },
    })
    if (!lease) return notFound('Lease not found or already processed')

    if (lease.tenantSignedAt) {
      return badRequest('This lease has already been signed')
    }

    const ip =
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      undefined

    await prisma.$transaction(async (tx) => {
      await tx.lease.update({
        where: { id: lease.id },
        data: {
          tenantSignatureName: parsed.data.signatureName,
          tenantSignatureIp: ip,
          tenantSignedAt: new Date(),
          contractStatus: 'SIGNED',
        },
      })

      // Advance applicant status if linked
      if (lease.applicantId) {
        const applicant = await tx.applicant.findUnique({ where: { id: lease.applicantId } })
        if (applicant && applicant.status !== 'LEASE_SIGNED') {
          await tx.applicant.update({
            where: { id: lease.applicantId },
            data: { status: 'LEASE_SIGNED' },
          })
        }
      }
    })

    return ok({ success: true })
  } catch {
    return serverError('Failed to sign lease')
  }
}

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { encrypt } from '@/lib/bank-agent/crypto'

const ReactivateSchema = z.object({
  tellerAccessToken: z.string().optional(),
  tellerEnrollmentId: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { id } = await params
    const body = await request.json()
    const parsed = ReactivateSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    const connection = await prisma.bankConnection.findFirst({
      where: { id, userId },
    })
    if (!connection) return notFound('Connection not found')

    const updateData: Record<string, unknown> = {
      status: 'ACTIVE',
      disconnectReason: null,
      errorCount: 0,
    }

    if (parsed.data.tellerAccessToken) {
      const enc = encrypt(parsed.data.tellerAccessToken, userId)
      updateData.tokenCiphertext = enc.ciphertext
      updateData.tokenIv = enc.iv
      updateData.tokenAuthTag = enc.authTag
      if (parsed.data.tellerEnrollmentId) {
        updateData.tellerEnrollmentId = parsed.data.tellerEnrollmentId
      }
    }

    await prisma.bankConnection.update({
      where: { id },
      data: updateData,
    })

    return ok({ reactivated: true })
  } catch (err) {
    console.error('[connections/reactivate]', err)
    return serverError('Failed to reactivate connection')
  }
}

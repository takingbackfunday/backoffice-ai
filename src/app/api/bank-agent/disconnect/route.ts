import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, badRequest, notFound, serverError } from '@/lib/api-response'

const DisconnectBodySchema = z.object({
  accountId: z.string().min(1),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return unauthorized()

  try {
    const body = await request.json()
    const parsed = DisconnectBodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    }

    const { accountId } = parsed.data

    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId }
    })

    if (!account) {
      return notFound('Account not found or does not belong to you')
    }

    // Delete all bank agent data for this account
    await prisma.$transaction(async (tx) => {
      // Delete sync jobs
      await tx.syncJob.deleteMany({
        where: { accountId }
      })

      // Delete encrypted credentials
      await tx.encryptedCredential.deleteMany({
        where: { accountId }
      })

      // Delete playbook
      await tx.bankPlaybook.deleteMany({
        where: { accountId }
      })
    })

    return ok({ disconnected: true })

  } catch (err) {
    console.error('[bank-agent/disconnect]', err)
    return serverError('Failed to disconnect bank account')
  }
}
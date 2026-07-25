import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { ok, notFound } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'

const QuerySchema = z.object({
  signature: z.string().min(1),
})

export const GET = authedRoute<void, void>({
  handler: async ({ userId, request }) => {
    const url = new URL(request.url)
    const signature = url.searchParams.get('signature')
    if (!signature) return notFound('Missing signature parameter')

    const parsed = QuerySchema.safeParse({ signature })
    if (!parsed.success) return notFound('Invalid signature')

    const profile = await prisma.importProfile.findUnique({
      where: {
        userId_signature: { userId, signature: parsed.data.signature },
      },
    })

    if (!profile) return notFound('No saved mapping for this file format')

    return ok(profile)
  },
})

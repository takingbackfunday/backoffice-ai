import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { prisma } from '@/lib/prisma'

interface ClerkUserCreatedEvent {
  type: 'user.created'
  data: {
    id: string
    email_addresses: Array<{ email_address: string; verification: { status: string } | null }>
    public_metadata: Record<string, unknown>
  }
}

interface ClerkEvent {
  type: string
  data: Record<string, unknown>
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const headersList = await headers()
  const svixId = headersList.get('svix-id')
  const svixTimestamp = headersList.get('svix-timestamp')
  const svixSignature = headersList.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const payload = await req.text()
  const wh = new Webhook(secret)

  let event: ClerkEvent
  try {
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (event.type === 'user.created') {
    const e = event as unknown as ClerkUserCreatedEvent
    const tenantId = e.data.public_metadata?.tenantId as string | undefined
    const role = e.data.public_metadata?.role as string | undefined

    if (role === 'tenant' && tenantId) {
      // Find the primary email address
      const primaryEmail = e.data.email_addresses.find(
        ea => ea.verification?.status === 'verified'
      )?.email_address ?? e.data.email_addresses[0]?.email_address

      if (primaryEmail) {
        // Link the Clerk user to the tenant record
        await prisma.tenant.updateMany({
          where: { id: tenantId, email: primaryEmail },
          data: {
            clerkUserId: e.data.id,
            portalInviteStatus: 'ACTIVE',
          },
        })
      }
    }
  }

  return new Response('OK', { status: 200 })
}

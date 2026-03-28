import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { userId, sessionClaims } = await auth()
  console.log('[callback] userId:', userId)
  if (!userId) redirect('/sign-in')

  // 1. Check session claims first (works for returning users)
  const sessionRole = (sessionClaims?.metadata as Record<string, string> | undefined)?.role
  console.log('[callback] sessionRole:', sessionRole, 'sessionClaims.metadata:', sessionClaims?.metadata)
  if (sessionRole === 'tenant') redirect('/portal')
  if (sessionRole && sessionRole !== 'tenant') redirect('/dashboard')

  // 2. Read from Clerk API (metadata may be set but session token not yet refreshed)
  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  const apiRole = (user.publicMetadata as Record<string, string>)?.role
  console.log('[callback] apiRole:', apiRole, 'publicMetadata:', user.publicMetadata)
  if (apiRole === 'tenant') redirect('/portal')
  if (apiRole && apiRole !== 'tenant') redirect('/dashboard')

  // 3. New sign-up via invite — metadata not yet written (webhook is async).
  //    Look up by email to detect if this is a tenant account.
  const primaryEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
  console.log('[callback] primaryEmail:', primaryEmail)
  if (primaryEmail) {
    const tenant = await prisma.tenant.findFirst({
      where: { email: primaryEmail },
    })
    console.log('[callback] tenant found by email:', tenant?.id ?? null)
    if (tenant) {
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { role: 'tenant', tenantId: tenant.id },
      })
      if (!tenant.clerkUserId) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { clerkUserId: userId, portalInviteStatus: 'ACTIVE' },
        })
      }
      redirect('/portal')
    }
  }

  console.log('[callback] no match — redirecting to /dashboard')
  redirect('/dashboard')
}

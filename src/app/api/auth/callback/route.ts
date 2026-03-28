import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

export async function GET() {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.redirect(`${BASE}/sign-in`)

  // 1. Check session claims first (works for returning users)
  const sessionRole = (sessionClaims?.metadata as Record<string, string> | undefined)?.role
  if (sessionRole === 'tenant') return NextResponse.redirect(`${BASE}/portal`)
  if (sessionRole && sessionRole !== 'tenant') return NextResponse.redirect(`${BASE}/dashboard`)

  // 2. Read from Clerk API (session token may not have metadata yet)
  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  const apiRole = (user.publicMetadata as Record<string, string>)?.role
  if (apiRole === 'tenant') return NextResponse.redirect(`${BASE}/portal`)
  if (apiRole && apiRole !== 'tenant') return NextResponse.redirect(`${BASE}/dashboard`)

  // 3. Fresh sign-up — look up by email
  const primaryEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
  if (primaryEmail) {
    const tenant = await prisma.tenant.findFirst({ where: { email: primaryEmail } })
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
      return NextResponse.redirect(`${BASE}/portal`)
    }
  }

  return NextResponse.redirect(`${BASE}/dashboard`)
}

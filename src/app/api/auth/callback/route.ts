import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export async function GET() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Read metadata directly from Clerk API — session token may not have it yet
  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  const role = (user.publicMetadata as Record<string, string>)?.role

  if (role === 'tenant') {
    redirect('/portal')
  }

  redirect('/dashboard')
}

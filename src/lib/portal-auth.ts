import { auth, clerkClient } from '@clerk/nextjs/server'

interface PortalSession {
  userId: string
  tenantId: string
  role: string
}

/**
 * Gets the tenant's userId and tenantId, falling back to the Clerk API
 * when the session token doesn't have metadata yet (e.g. on first sign-in).
 * Returns null if the user is not authenticated or not a tenant.
 */
export async function getPortalSession(): Promise<PortalSession | null> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return null

  let role = (sessionClaims?.metadata as Record<string, string> | undefined)?.role
  let tenantId = (sessionClaims?.metadata as Record<string, string> | undefined)?.tenantId

  if (!role || !tenantId) {
    const clerk = await clerkClient()
    const user = await clerk.users.getUser(userId)
    role = (user.publicMetadata as Record<string, string>)?.role
    tenantId = (user.publicMetadata as Record<string, string>)?.tenantId
  }

  if (role !== 'tenant' || !tenantId) return null

  return { userId, tenantId, role }
}

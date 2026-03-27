import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { prisma } from '@/lib/prisma'
import { PortalNav } from '@/components/portal/portal-nav'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { userId, sessionClaims } = await auth()
  if (!userId) redirect('/sign-in')

  const role = (sessionClaims?.metadata as Record<string, string> | undefined)?.role
  if (role !== 'tenant') redirect('/dashboard')

  const tenantId = (sessionClaims?.metadata as Record<string, string> | undefined)?.tenantId
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
    : null

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold">Tenant Portal</span>
          {tenant && (
            <span className="text-sm text-muted-foreground">· {tenant.name}</span>
          )}
        </div>
        <UserButton />
      </header>
      <PortalNav />
      <main className="p-6">{children}</main>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { prisma } from '@/lib/prisma'
import { PortalNav } from '@/components/portal/portal-nav'
import { getPortalSession } from '@/lib/portal-auth'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession()
  if (!session) redirect('/dashboard')

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { name: true },
  })

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

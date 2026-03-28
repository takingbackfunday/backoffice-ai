import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PortfolioClient } from '@/components/portfolio/portfolio-client'

export default async function PortfolioPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const properties = await prisma.project.findMany({
    where: { userId, type: 'PROPERTY', isActive: true },
    include: {
      propertyProfile: {
        include: {
          units: {
            include: {
              leases: {
                where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
                include: { tenant: { select: { id: true, name: true } } },
                orderBy: { startDate: 'desc' },
                take: 1,
              },
              _count: {
                select: {
                  maintenanceRequests: {
                    where: { status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } },
                  },
                },
              },
            },
            orderBy: { unitLabel: 'asc' },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Portfolio-level KPIs
  const allUnits = properties.flatMap(p => p.propertyProfile?.units ?? [])
  const totalUnits = allUnits.length
  const leasedUnits = allUnits.filter(u => u.status === 'LEASED').length
  const vacantUnits = allUnits.filter(u => u.status === 'VACANT').length
  const openMaintenance = allUnits.reduce((sum, u) => sum + u._count.maintenanceRequests, 0)
  const monthlyRevenue = allUnits
    .filter(u => u.status === 'LEASED' && u.monthlyRent)
    .reduce((sum, u) => sum + Number(u.monthlyRent), 0)

  const kpis = { totalUnits, leasedUnits, vacantUnits, openMaintenance, monthlyRevenue }

  const serialized = properties.map(p => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    units: (p.propertyProfile?.units ?? []).map(u => ({
      id: u.id,
      unitLabel: u.unitLabel,
      status: u.status,
      monthlyRent: u.monthlyRent ? Number(u.monthlyRent) : null,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms ? Number(u.bathrooms) : null,
      tenant: u.leases[0]?.tenant ?? null,
      leaseEndDate: u.leases[0]?.endDate?.toISOString() ?? null,
      openMaintenance: u._count.maintenanceRequests,
    })),
  }))

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Portfolio" />
        <main className="flex-1 p-6" role="main">
          <PortfolioClient properties={serialized} kpis={kpis} />
        </main>
      </div>
    </div>
  )
}

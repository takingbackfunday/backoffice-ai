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
                include: {
                  tenant: { select: { id: true, name: true, email: true, phone: true } },
                  tenantCharges: {
                    orderBy: { dueDate: 'desc' },
                    take: 12,
                  },
                  tenantPayments: {
                    orderBy: { paidDate: 'desc' },
                    take: 12,
                  },
                },
                orderBy: { startDate: 'desc' },
                take: 1,
              },
              maintenanceRequests: {
                where: { status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } },
                include: { tenant: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
              },
              messages: {
                where: { isRead: false, senderRole: 'tenant' },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: { tenant: { select: { id: true, name: true } } },
              },
              _count: {
                select: {
                  maintenanceRequests: {
                    where: { status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } },
                  },
                  messages: {
                    where: { isRead: false, senderRole: 'tenant' },
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
  const unreadMessages = allUnits.reduce((sum, u) => sum + u._count.messages, 0)
  const monthlyRevenue = allUnits
    .filter(u => u.status === 'LEASED' && u.monthlyRent)
    .reduce((sum, u) => sum + Number(u.monthlyRent), 0)

  // Lease expiring within 90 days
  const now = new Date()
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const expiringLeases = allUnits.filter(u => {
    const lease = u.leases[0]
    if (!lease?.endDate) return false
    const end = new Date(lease.endDate)
    return end >= now && end <= in90Days
  }).length

  // Rent collection: count units where balance > 0 (more owed than paid)
  const overduePayments = allUnits.filter(u => {
    const lease = u.leases[0]
    if (!lease) return false
    const charged = lease.tenantCharges
      .filter(c => !c.forgivenAt)
      .reduce((sum, c) => sum + Number(c.amount), 0)
    const paid = lease.tenantPayments.filter(p => !p.voidedAt).reduce((sum, p) => sum + Number(p.amount), 0)
    return charged - paid > 0
  }).length

  const propertyProfileIds = properties.flatMap(p => p.propertyProfile ? [p.propertyProfile.id] : [])
  const activeApplicants = propertyProfileIds.length > 0
    ? await prisma.applicant.count({
        where: {
          propertyProfileId: { in: propertyProfileIds },
          status: { notIn: ['REJECTED', 'WITHDRAWN', 'LEASE_SIGNED'] },
        },
      })
    : 0

  const kpis = {
    totalUnits, leasedUnits, vacantUnits, openMaintenance,
    monthlyRevenue, expiringLeases, unreadMessages, overduePayments, activeApplicants,
  }

  const serialized = properties.map(p => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    address: p.propertyProfile?.address ?? null,
    city: p.propertyProfile?.city ?? null,
    state: p.propertyProfile?.state ?? null,
    propertyType: p.propertyProfile?.propertyType ?? null,
    units: (p.propertyProfile?.units ?? []).map(u => ({
      id: u.id,
      unitLabel: u.unitLabel,
      status: u.status,
      monthlyRent: u.monthlyRent ? Number(u.monthlyRent) : null,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms ? Number(u.bathrooms) : null,
      squareFootage: u.squareFootage,
      tenant: u.leases[0]?.tenant ?? null,
      leaseId: u.leases[0]?.id ?? null,
      leaseEndDate: u.leases[0]?.endDate?.toISOString() ?? null,
      leaseStartDate: u.leases[0]?.startDate?.toISOString() ?? null,
      leaseStatus: u.leases[0]?.status ?? null,
      leaseMonthlyRent: u.leases[0]?.monthlyRent ? Number(u.leases[0].monthlyRent) : null,
      paymentDueDay: u.leases[0]?.paymentDueDay ?? null,
      openMaintenance: u._count.maintenanceRequests,
      unreadMessages: u._count.messages,
      maintenanceRequests: u.maintenanceRequests.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        priority: m.priority,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        tenant: m.tenant ? { id: m.tenant.id, name: m.tenant.name } : null,
      })),
      tenantCharges: (u.leases[0]?.tenantCharges ?? []).map(c => ({
        id: c.id,
        type: c.type,
        description: c.description ?? null,
        amount: Number(c.amount),
        dueDate: c.dueDate.toISOString(),
        forgivenAt: c.forgivenAt?.toISOString() ?? null,
      })),
      tenantPayments: (u.leases[0]?.tenantPayments ?? []).map(p => ({
        id: p.id,
        amount: Number(p.amount),
        paidDate: p.paidDate.toISOString(),
        paymentMethod: p.paymentMethod ?? null,
        notes: p.notes ?? null,
        sourceDeleted: p.sourceDeleted,
        voidedAt: p.voidedAt?.toISOString() ?? null,
      })),
      recentMessages: u.messages.map(m => ({
        id: m.id,
        subject: m.subject,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        isRead: m.isRead,
        senderRole: m.senderRole,
        tenant: m.tenant ? { id: m.tenant.id, name: m.tenant.name } : null,
      })),
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

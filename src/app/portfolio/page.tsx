import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PortfolioClient } from '@/components/portfolio/portfolio-client'

interface PageProps {
  searchParams: Promise<{ onboarding?: string }>
}

export default async function PortfolioPage({ searchParams }: PageProps) {
  const params = await searchParams
  const isOnboarding = params.onboarding === '1'
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const properties = await prisma.workspace.findMany({
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
                  invoices: {
                    where: { status: { not: 'VOID' } },
                    include: { lineItems: true, payments: true },
                    orderBy: { dueDate: 'desc' },
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
    const charged = lease.invoices.reduce((s, inv) =>
      s + inv.lineItems.filter(li => !li.forgivenAt).reduce((s2, li) => s2 + Number(li.quantity) * Number(li.unitPrice), 0), 0)
    const paid = lease.invoices.reduce((s, inv) =>
      s + inv.payments.filter(p => !p.voidedAt).reduce((s2, p) => s2 + Number(p.amount), 0), 0)
    return charged - paid > 0
  }).length

  const propertyProfileIds = properties.flatMap(p => p.propertyProfile ? [p.propertyProfile.id] : [])
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [activeApplicants, recentPaymentsCount] = await Promise.all([
    propertyProfileIds.length > 0
      ? prisma.applicant.count({
          where: {
            propertyProfileId: { in: propertyProfileIds },
            status: { notIn: ['REJECTED', 'WITHDRAWN', 'LEASE_SIGNED'] },
          },
        })
      : Promise.resolve(0),
    propertyProfileIds.length > 0
      ? prisma.invoicePayment.count({
          where: {
            paidDate: { gte: sevenDaysAgo },
            invoice: {
              lease: { unit: { propertyProfileId: { in: propertyProfileIds } } },
            },
          },
        })
      : Promise.resolve(0),
  ])

  const kpis = {
    totalUnits, leasedUnits, vacantUnits, openMaintenance,
    monthlyRevenue, expiringLeases, unreadMessages, overduePayments, activeApplicants,
    recentPaymentsCount,
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
      invoices: (u.leases[0]?.invoices ?? []).map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        period: inv.period,
        dueDate: inv.dueDate.toISOString(),
        lineItemTotal: inv.lineItems.filter(li => !li.forgivenAt).reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0),
        paymentTotal: inv.payments.filter(p => !p.voidedAt).reduce((s, p) => s + Number(p.amount), 0),
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
        <Header title="Properties" />
        <main className="flex-1 p-6" role="main">
          <PortfolioClient properties={serialized} kpis={kpis} isOnboarding={isOnboarding} />
        </main>
      </div>
    </div>
  )
}

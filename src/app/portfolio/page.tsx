import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PortfolioClient } from '@/components/portfolio/portfolio-client'
import { fetchPortfolioKpis, fetchUnitSummaries } from '@/lib/studio-kpis'

// Types matching the client component
interface MaintenanceRequest {
  id: string; title: string; description: string; priority: string;
  status: string; createdAt: string;
  tenant: { id: string; name: string } | null
}
interface InvoiceSummary {
  id: string; invoiceNumber: string; status: string; period: string | null;
  dueDate: string; lineItemTotal: number; paymentTotal: number;
}
interface RecentMessage {
  id: string; subject: string | null; body: string;
  createdAt: string; isRead: boolean; senderRole: string;
  tenant: { id: string; name: string } | null
}
interface Unit {
  id: string; unitLabel: string; status: string;
  monthlyRent: number | null; bedrooms: number | null;
  bathrooms: number | null; squareFootage: number | null;
  tenant: { id: string; name: string; email: string; phone: string | null } | null
  leaseId: string | null;
  leaseEndDate: string | null; leaseStartDate: string | null;
  leaseStatus: string | null; leaseMonthlyRent: number | null;
  paymentDueDay: number | null;
  openMaintenance: number; unreadMessages: number;
  hasOverdueRent: boolean; balance: number; paymentStatusScore: number;
  maintenanceRequests: MaintenanceRequest[]
  invoices: InvoiceSummary[]
  recentMessages: RecentMessage[]
}

interface PageProps {
  searchParams: Promise<{ onboarding?: string }>
}

export default async function PortfolioPage({ searchParams }: PageProps) {
  const params = await searchParams
  const isOnboarding = params.onboarding === '1'
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Parallel fetch: KPIs, unit summaries via SQL, plus auxiliary data
  const [kpis, unitSummaries, overheadWorkspace, activeApplicants, recentPaymentsCount] = await Promise.all([
    fetchPortfolioKpis(userId),
    fetchUnitSummaries(userId),
    prisma.workspace.findFirst({ where: { userId, isDefault: true }, select: { id: true } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM "Applicant" a
      JOIN "PropertyProfile" pp ON pp."id" = a."propertyProfileId"
      JOIN "Workspace" w ON w."id" = pp."workspaceId"
      WHERE w."userId" = ${userId}
        AND a."status" NOT IN ('REJECTED', 'WITHDRAWN', 'LEASE_SIGNED')
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM "InvoicePayment" p
      JOIN "Invoice" inv ON inv."id" = p."invoiceId"
      JOIN "Lease" l ON l."id" = inv."leaseId"
      JOIN "Unit" u ON u."id" = l."unitId"
      JOIN "PropertyProfile" pp ON pp."id" = u."propertyProfileId"
      JOIN "Workspace" w ON w."id" = pp."workspaceId"
      WHERE w."userId" = ${userId}
        AND p."paidDate" >= ${sevenDaysAgo}
    `,
  ])

  // Group unit summaries by property for the client component
  const propertyMap = new Map<string, {
    id: string
    name: string
    slug: string
    address: string | null
    city: string | null
    state: string | null
    propertyType: string | null
    units: Unit[]
  }>()

  for (const unit of unitSummaries) {
    if (!propertyMap.has(unit.propertyId)) {
      propertyMap.set(unit.propertyId, {
        id: unit.propertyId,
        name: unit.propertyName,
        slug: unit.propertySlug,
        address: unit.propertyAddress,
        city: unit.propertyCity,
        state: unit.propertyState,
        propertyType: unit.propertyType,
        units: [],
      })
    }
    // Add empty arrays for detail data (fetched on expand)
    propertyMap.get(unit.propertyId)!.units.push({
      id: unit.id,
      unitLabel: unit.unitLabel,
      status: unit.status,
      monthlyRent: unit.monthlyRent,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      squareFootage: unit.squareFootage,
      tenant: unit.tenantId ? { id: unit.tenantId, name: unit.tenantName ?? '', email: unit.tenantEmail ?? '', phone: unit.tenantPhone } : null,
      leaseId: unit.leaseId,
      leaseEndDate: unit.leaseEndDate,
      leaseStartDate: unit.leaseStartDate,
      leaseStatus: unit.leaseStatus,
      leaseMonthlyRent: unit.leaseMonthlyRent,
      paymentDueDay: unit.paymentDueDay,
      openMaintenance: unit.openMaintenance,
      unreadMessages: unit.unreadMessages,
      hasOverdueRent: unit.hasOverdueRent,
      balance: unit.balance,
      paymentStatusScore: unit.paymentStatusScore,
      maintenanceRequests: [],
      invoices: [],
      recentMessages: [],
    })
  }

  const properties = Array.from(propertyMap.values())

  const kpiData = {
    totalUnits: kpis.totalUnits,
    leasedUnits: kpis.leasedUnits,
    vacantUnits: kpis.vacantUnits,
    openMaintenance: kpis.openMaintenance,
    monthlyRevenue: kpis.monthlyRevenue,
    expiringLeases: kpis.expiringLeases,
    unreadMessages: kpis.unreadMessages,
    overduePayments: kpis.overduePayments,
    activeApplicants: Number(activeApplicants[0]?.count ?? 0),
    recentPaymentsCount: Number(recentPaymentsCount[0]?.count ?? 0),
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Properties" />
        <main className="flex-1 p-6" role="main">
          <PortfolioClient properties={properties} kpis={kpiData} isOnboarding={isOnboarding} hasOverheadWorkspace={!!overheadWorkspace} />
        </main>
      </div>
    </div>
  )
}

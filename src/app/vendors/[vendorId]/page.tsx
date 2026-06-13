import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PageShell } from '@/components/layout/page-shell'
import { VendorDetail } from '@/components/vendors/vendor-detail'

interface PageParams { params: Promise<{ vendorId: string }> }

export default async function VendorDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { vendorId } = await params

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, userId },
    include: {
      documents: { orderBy: { createdAt: 'desc' } },
      workOrders: {
        include: {
          bills: {
            include: {
              transaction: { select: { id: true, date: true, amount: true, description: true } },
            },
            orderBy: { issueDate: 'desc' },
          },
          workspace: { select: { id: true, name: true, slug: true } },
          job: { select: { id: true, name: true } },
          maintenanceRequest: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!vendor) notFound()

  return (
    <PageShell
      breadcrumb={[
        { label: 'Vendors', href: '/vendors' },
        { label: vendor.name },
      ]}
    >
      <VendorDetail vendor={JSON.parse(JSON.stringify(vendor))} />
    </PageShell>
  )
}

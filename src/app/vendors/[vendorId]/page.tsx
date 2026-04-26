import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ChevronLeft } from 'lucide-react'
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
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title={vendor.name} />
        <main className="flex-1 p-6" role="main">
          <Link
            href="/vendors"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
          >
            <ChevronLeft className="w-3 h-3" /> All vendors
          </Link>
          <VendorDetail vendor={JSON.parse(JSON.stringify(vendor))} />
        </main>
      </div>
    </div>
  )
}

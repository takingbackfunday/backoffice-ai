import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { VendorList } from '@/components/vendors/vendor-list'

export default async function VendorsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const vendors = await prisma.vendor.findMany({
    where: { userId },
    include: {
      documents: { orderBy: { createdAt: 'desc' } },
      _count: { select: { workOrders: true, bills: true } },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Vendors" />
        <main className="flex-1 p-6" role="main">
          <VendorList vendors={JSON.parse(JSON.stringify(vendors))} />
        </main>
      </div>
    </div>
  )
}

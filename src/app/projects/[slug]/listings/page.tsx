import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { ListingsClient } from '@/components/projects/listings-client'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectListingsPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.project.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: {
      propertyProfile: {
        include: {
          units: {
            select: { id: true, unitLabel: true, status: true },
            orderBy: { unitLabel: 'asc' },
          },
        },
      },
    },
  })

  if (!project) notFound()

  const unitIds = project.propertyProfile?.units.map(u => u.id) ?? []

  const listings = await prisma.listing.findMany({
    where: { unitId: { in: unitIds }, userId },
    include: {
      unit: { select: { id: true, unitLabel: true, status: true } },
      _count: { select: { applicants: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const serializedListings = listings.map(l => ({
    ...l,
    monthlyRent: Number(l.monthlyRent),
    applicationFee: l.applicationFee ? Number(l.applicationFee) : null,
    screeningFee: l.screeningFee ? Number(l.screeningFee) : null,
    availableDate: l.availableDate ? l.availableDate.toISOString() : null,
    photos: l.photos as string[],
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }))

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title={project.name} />
        <main className="flex-1 p-6" role="main">
          <ProjectDetailHeader
            id={project.id}
            name={project.name}
            type={project.type}
            isActive={project.isActive}
            description={project.description}
          />
          <ProjectSubNav slug={slug} type={project.type} />
          <ListingsClient
            projectId={project.id}
            listings={serializedListings}
            units={project.propertyProfile?.units ?? []}
          />
        </main>
      </div>
    </div>
  )
}

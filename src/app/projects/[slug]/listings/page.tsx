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

  const project = await prisma.workspace.findFirst({
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
    id: l.id,
    title: l.title,
    description: l.description,
    monthlyRent: Number(l.monthlyRent),
    applicationFee: l.applicationFee ? Number(l.applicationFee) : null,
    screeningFee: l.screeningFee ? Number(l.screeningFee) : null,
    availableDate: l.availableDate ? l.availableDate.toISOString() : null,
    petPolicy: l.petPolicy,
    photos: l.photos as string[],
    amenities: l.amenities,
    isActive: l.isActive,
    publicSlug: l.publicSlug,
    unit: { id: l.unit.id, unitLabel: l.unit.unitLabel, status: l.unit.status },
    _count: { applicants: l._count.applicants },
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

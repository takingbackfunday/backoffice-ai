import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
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
  if (!project.propertyProfile) redirect(`/projects/${slug}`)

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

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Listings' }]}
    >
      <ListingsClient
        projectId={project.id}
        listings={serializedListings}
        units={project.propertyProfile?.units ?? []}
      />
    </ProjectPageShell>
  )
}
